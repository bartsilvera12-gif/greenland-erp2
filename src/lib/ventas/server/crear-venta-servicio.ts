import type { SupabaseClient } from "@supabase/supabase-js";

export interface ServicioLine {
  descripcion: string;
  monto: number;
  tipo_iva: "EXENTA" | "5%" | "10%";
}

export interface CrearVentaServicioBody {
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

function isMoneda(v: unknown): v is "GS" | "USD" { return v === "GS" || v === "USD"; }
function isTipoIva(v: unknown): v is "EXENTA" | "5%" | "10%" { return v === "EXENTA" || v === "5%" || v === "10%"; }
function isTipoVenta(v: unknown): v is "CONTADO" | "CREDITO" { return v === "CONTADO" || v === "CREDITO"; }

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function asServicios(raw: unknown, defaultIva: "EXENTA" | "5%" | "10%"): ServicioLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      if (!r || typeof r !== "object") return null;
      const o = r as Record<string, unknown>;
      const descripcion = String(o.descripcion ?? "").trim();
      const monto = Number(o.monto);
      if (!descripcion || !Number.isFinite(monto) || monto <= 0) return null;
      const tv = o.tipo_iva;
      const tipo_iva: "EXENTA" | "5%" | "10%" =
        tv === "EXENTA" || tv === "5%" || tv === "10%" ? tv : defaultIva;
      return { descripcion, monto, tipo_iva } satisfies ServicioLine;
    })
    .filter((x): x is ServicioLine => x !== null);
}

export class VentaServicioError extends Error {
  status: number;
  constructor(msg: string, status = 400) {
    super(msg);
    this.name = "VentaServicioError";
    this.status = status;
  }
}

export interface CrearVentaServicioResult {
  venta_id: string;
  numero_control: string;
  cliente_id: string;
  total: number;
  tipo_venta: "CONTADO" | "CREDITO";
}

/**
 * Crea una venta de servicio + su(s) cuenta(s) por cobrar.
 * Reutilizado por /api/ventas/servicio (crear) y /api/ventas/[id]/reemplazar (editar).
 */
export async function crearVentaServicio(
  supabase: SupabaseClient,
  empresaId: string,
  body: CrearVentaServicioBody,
  opts?: { numeroControlOverride?: string | null }
): Promise<CrearVentaServicioResult> {
  const razonSocial = String(body.cliente_razon_social ?? "").trim();
  if (!razonSocial) throw new VentaServicioError("La razón social del cliente es obligatoria");
  const moneda = isMoneda(body.moneda) ? body.moneda : "GS";
  const tipoIva = isTipoIva(body.tipo_iva) ? body.tipo_iva : "10%";
  const servicios = asServicios(body.servicios, tipoIva);
  if (!servicios.length) throw new VentaServicioError("Cargá al menos un servicio");
  const tipoVenta = isTipoVenta(body.tipo_venta) ? body.tipo_venta : "CONTADO";

  const total = servicios.reduce((a, s) => a + s.monto, 0);
  if (total <= 0) throw new VentaServicioError("El total debe ser mayor a 0");

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
      .insert({ empresa_id: empresaId, empresa: razonSocial, nombre_contacto: razonSocial, ruc: cliRuc, documento: cliDoc })
      .select("id")
      .single();
    if (insCli.error) throw new VentaServicioError(`No se pudo crear el cliente: ${insCli.error.message}`);
    clienteId = (insCli.data as { id: string }).id;
  }

  const hoy = new Date();
  const yyyymmdd = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, "0")}${String(hoy.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  const numeroControl = (opts?.numeroControlOverride && opts.numeroControlOverride.trim())
    ? opts.numeroControlOverride.trim()
    : `VTA-${yyyymmdd}-${rand}`;

  const propiedadId = body.propiedad_id && UUID_RE.test(body.propiedad_id) ? body.propiedad_id : null;

  type PropSnap = {
    titulo: string | null; codigo: string | null; ciudad: string | null; barrio: string | null;
    finca: string | null; padron: string | null; cuenta_catastral: string | null; terreno_m2: number | string | null;
  };
  let propSnap: PropSnap | null = null;
  if (propiedadId) {
    const { data: pData } = await supabase
      .from("propiedades")
      .select("titulo, codigo, ciudad, barrio, finca, padron, cuenta_catastral, terreno_m2")
      .eq("empresa_id", empresaId)
      .eq("id", propiedadId)
      .maybeSingle();
    if (pData) propSnap = pData as PropSnap;
  }

  // Snapshot del payload para poder editar la venta luego sin perder tipo_iva, observaciones, líneas.
  const payloadSnapshot = {
    cliente_razon_social: razonSocial,
    cliente_ruc: cliRuc,
    cliente_documento: cliDoc,
    moneda,
    tipo_iva: tipoIva,
    servicios,
    observaciones: body.observaciones ?? null,
    tipo_venta: tipoVenta,
    cuotas_cantidad: body.cuotas_cantidad ?? null,
    cuota_monto: body.cuota_monto ?? null,
    fecha_primera_cuota: body.fecha_primera_cuota ?? null,
    intervalo_dias: body.intervalo_dias ?? null,
    propiedad_id: propiedadId,
  };

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
      propiedad_titulo_snapshot:           propSnap?.titulo ?? null,
      propiedad_codigo_snapshot:           propSnap?.codigo ?? null,
      propiedad_ciudad_snapshot:           propSnap?.ciudad ?? null,
      propiedad_barrio_snapshot:           propSnap?.barrio ?? null,
      propiedad_finca_snapshot:            propSnap?.finca ?? null,
      propiedad_padron_snapshot:           propSnap?.padron ?? null,
      propiedad_cuenta_catastral_snapshot: propSnap?.cuenta_catastral ?? null,
      propiedad_terreno_m2_snapshot:       propSnap?.terreno_m2 ?? null,
      payload_snapshot: payloadSnapshot,
    })
    .select("id, numero_control")
    .single();
  if (insVenta.error) throw new VentaServicioError(`No se pudo crear la venta: ${insVenta.error.message}`);
  const venta = insVenta.data as { id: string; numero_control: string };

  const monedaCxc = moneda === "USD" ? "USD" : "GS";
  const fechaEmision = hoy.toISOString().slice(0, 10);

  if (tipoVenta === "CONTADO") {
    const ins = await supabase
      .from("cuentas_por_cobrar")
      .insert({
        empresa_id: empresaId, cliente_id: clienteId, venta_id: venta.id,
        numero_venta: numeroControl, fecha_emision: fechaEmision, fecha_vencimiento: fechaEmision,
        moneda: monedaCxc, total: Math.round(total), saldo: 0, estado: "pagado",
        numero_cuota: 1, total_cuotas: 1,
      });
    if (ins.error) console.error("[crearVentaServicio] cxc contado:", ins.error.message);
  } else {
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
      const montoCuota = i < n ? cuotaMonto : Math.round(total - acumulado);
      acumulado += montoCuota;
      rows.push({
        empresa_id: empresaId, cliente_id: clienteId, venta_id: venta.id,
        numero_venta: `${numeroControl}-C${i}`,
        fecha_emision: fechaEmision, fecha_vencimiento: baseFecha,
        moneda: monedaCxc, total: montoCuota, saldo: montoCuota, estado: "pendiente",
        numero_cuota: i, total_cuotas: n,
      });
      baseFecha = addDaysISO(baseFecha, intervalo);
    }

    const ins = await supabase.from("cuentas_por_cobrar").insert(rows);
    if (ins.error) throw new VentaServicioError(`Venta creada pero falló el alta de cuotas: ${ins.error.message}`, 500);
  }

  return { venta_id: venta.id, numero_control: venta.numero_control, cliente_id: clienteId, total, tipo_venta: tipoVenta };
}
