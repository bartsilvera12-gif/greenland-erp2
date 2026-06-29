import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ServicioLine {
  descripcion: string;
  monto: number;
}
interface Body {
  cliente_id?: string | null;
  cliente_razon_social?: string;
  cliente_ruc?: string | null;
  cliente_documento?: string | null;
  moneda?: "GS" | "USD";
  tipo_iva?: "EXENTA" | "5%" | "10%";
  servicios?: ServicioLine[];
  observaciones?: string | null;
  tipo_venta?: "CONTADO" | "CREDITO";
  cuotas_cantidad?: number;
  cuota_monto?: number;
  fecha_primera_cuota?: string;
  intervalo_dias?: number;
  propiedad_id?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isMoneda(v: unknown): v is "GS" | "USD" {
  return v === "GS" || v === "USD";
}
function isTipoIva(v: unknown): v is "EXENTA" | "5%" | "10%" {
  return v === "EXENTA" || v === "5%" || v === "10%";
}
function isTipoVenta(v: unknown): v is "CONTADO" | "CREDITO" {
  return v === "CONTADO" || v === "CREDITO";
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function asServicios(raw: unknown): ServicioLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      if (!r || typeof r !== "object") return null;
      const o = r as Record<string, unknown>;
      const descripcion = String(o.descripcion ?? "").trim();
      const monto = Number(o.monto);
      if (!descripcion || !Number.isFinite(monto) || monto <= 0) return null;
      return { descripcion, monto } satisfies ServicioLine;
    })
    .filter((x): x is ServicioLine => x !== null);
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    const empresaId = auth.empresa_id;

    const body = (await request.json().catch(() => ({}))) as Body;
    const razonSocial = String(body.cliente_razon_social ?? "").trim();
    if (!razonSocial) {
      return NextResponse.json(errorResponse("La razón social del cliente es obligatoria"), { status: 400 });
    }
    const moneda = isMoneda(body.moneda) ? body.moneda : "GS";
    const tipoIva = isTipoIva(body.tipo_iva) ? body.tipo_iva : "10%";
    const servicios = asServicios(body.servicios);
    if (!servicios.length) {
      return NextResponse.json(errorResponse("Cargá al menos un servicio"), { status: 400 });
    }
    const tipoVenta = isTipoVenta(body.tipo_venta) ? body.tipo_venta : "CONTADO";

    const total = servicios.reduce((a, s) => a + s.monto, 0);
    if (total <= 0) {
      return NextResponse.json(errorResponse("El total debe ser mayor a 0"), { status: 400 });
    }

    // Cliente: si vino cliente_id usamos ese, sino buscamos o creamos por documento/ruc.
    let clienteId = body.cliente_id ?? null;
    const cliRuc = (body.cliente_ruc ?? "").trim() || null;
    const cliDoc = (body.cliente_documento ?? "").trim() || null;

    if (!clienteId && (cliRuc || cliDoc)) {
      const { data: existing } = await supabase
        .from("clientes")
        .select("id")
        .eq("empresa_id", empresaId)
        .or(`ruc.eq.${cliRuc ?? ""},documento.eq.${cliDoc ?? ""}`)
        .limit(1);
      const hit = (existing ?? [])[0] as { id: string } | undefined;
      if (hit) clienteId = hit.id;
    }
    if (!clienteId) {
      const insCli = await supabase
        .from("clientes")
        .insert({
          empresa_id: empresaId,
          empresa: razonSocial,
          nombre_contacto: razonSocial,
          ruc: cliRuc,
          documento: cliDoc,
        })
        .select("id")
        .single();
      if (insCli.error) {
        return NextResponse.json(errorResponse(`No se pudo crear el cliente: ${insCli.error.message}`), { status: 400 });
      }
      clienteId = (insCli.data as { id: string }).id;
    }

    // Generar numero_control simple: VTA-{YYYYMMDD}-{rand6}
    const hoy = new Date();
    const yyyymmdd = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, "0")}${String(hoy.getDate()).padStart(2, "0")}`;
    const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
    const numeroControl = `VTA-${yyyymmdd}-${rand}`;

    // Insertar venta principal
    const propiedadId = body.propiedad_id && UUID_RE.test(body.propiedad_id) ? body.propiedad_id : null;
    const insVenta = await supabase
      .from("ventas")
      .insert({
        empresa_id: empresaId,
        cliente_id: clienteId,
        numero_control: numeroControl,
        tipo_venta: tipoVenta,
        total: Math.round(total),
        moneda,
        propiedad_id: propiedadId,
      })
      .select("id, numero_control")
      .single();
    if (insVenta.error) {
      return NextResponse.json(errorResponse(`No se pudo crear la venta: ${insVenta.error.message}`), { status: 400 });
    }
    const venta = insVenta.data as { id: string; numero_control: string };

    // Cuentas por cobrar — segun tipo de venta
    const monedaCxc = moneda === "USD" ? "USD" : "GS";
    const fechaEmision = hoy.toISOString().slice(0, 10);

    if (tipoVenta === "CONTADO") {
      // 1 cuenta marcada como pagada
      const ins = await supabase
        .from("cuentas_por_cobrar")
        .insert({
          empresa_id: empresaId,
          cliente_id: clienteId,
          venta_id: venta.id,
          numero_venta: numeroControl,
          fecha_emision: fechaEmision,
          fecha_vencimiento: fechaEmision,
          moneda: monedaCxc,
          total: Math.round(total),
          saldo: 0,
          estado: "pagado",
          numero_cuota: 1,
          total_cuotas: 1,
        });
      if (ins.error) console.error("[venta servicio] cxc contado:", ins.error.message);
    } else {
      // CRÉDITO: N cuotas
      const n = Math.max(1, Math.min(120, Math.trunc(Number(body.cuotas_cantidad) || 1)));
      const cuotaMonto = Number(body.cuota_monto) > 0
        ? Math.round(Number(body.cuota_monto))
        : Math.round(total / n);
      const intervalo = Math.max(1, Math.trunc(Number(body.intervalo_dias) || 30));
      let baseFecha = body.fecha_primera_cuota && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha_primera_cuota)
        ? body.fecha_primera_cuota
        : addDaysISO(fechaEmision, intervalo);

      const rows = [] as Array<Record<string, unknown>>;
      let acumulado = 0;
      for (let i = 1; i <= n; i++) {
        // La última cuota redondea el resto para no perder centavos.
        const montoCuota = i < n ? cuotaMonto : Math.round(total - acumulado);
        acumulado += montoCuota;
        rows.push({
          empresa_id: empresaId,
          cliente_id: clienteId,
          venta_id: venta.id,
          numero_venta: `${numeroControl}-C${i}`,
          fecha_emision: fechaEmision,
          fecha_vencimiento: baseFecha,
          moneda: monedaCxc,
          total: montoCuota,
          saldo: montoCuota,
          estado: "pendiente",
          numero_cuota: i,
          total_cuotas: n,
        });
        baseFecha = addDaysISO(baseFecha, intervalo);
      }

      const ins = await supabase.from("cuentas_por_cobrar").insert(rows);
      if (ins.error) {
        return NextResponse.json(errorResponse(`Venta creada pero falló el alta de cuotas: ${ins.error.message}`), { status: 500 });
      }
    }

    return NextResponse.json(
      successResponse({
        venta: { id: venta.id, numero_control: venta.numero_control, total, tipo_venta: tipoVenta },
        cliente_id: clienteId,
      }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("[/api/ventas/servicio POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
