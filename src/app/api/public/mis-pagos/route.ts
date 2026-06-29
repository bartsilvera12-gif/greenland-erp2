import { NextRequest } from "next/server";
import { corsJson, corsPreflight, getPublicSupabase, resolvePublicEmpresaId } from "@/lib/public-api/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsPreflight();
}

function normalizarDoc(s: string): string {
  return s.replace(/[\s.\-]/g, "").trim();
}

function fmtFecha(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

/**
 * GET /api/public/mis-pagos?ci=2321486
 * GET /api/public/mis-pagos?ruc=80012345-6
 *
 * Devuelve el estado de cuenta del cliente identificado:
 * - resumen: total pendiente, vencido, próxima cuota
 * - cuotas: lista de facturas/cuotas (numero, vencimiento, monto, saldo, estado, dias_mora)
 *
 * Sin información sensible (no expone otros datos del cliente más que su nombre).
 */
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const ci = sp.get("ci");
  const ruc = sp.get("ruc");
  const doc = (ci ?? ruc ?? "").trim();
  if (!doc) {
    return corsJson({ success: false, error: "Falta ci o ruc en la query" }, { status: 400 });
  }
  const norm = normalizarDoc(doc);
  if (norm.length < 4) {
    return corsJson({ success: false, error: "Documento demasiado corto" }, { status: 400 });
  }

  const supabase = getPublicSupabase();
  const empresaId = await resolvePublicEmpresaId(supabase);
  if (!empresaId) return corsJson({ success: false, error: "empresa no resuelta" }, { status: 500 });

  // 1) Buscar cliente por documento o RUC
  const { data: clientesRaw, error: errCli } = await supabase
    .from("clientes")
    .select("id, empresa, nombre_contacto, documento, ruc")
    .eq("empresa_id", empresaId)
    .or(`documento.eq.${norm},ruc.eq.${norm},documento.eq.${doc},ruc.eq.${doc}`);

  if (errCli) return corsJson({ success: false, error: errCli.message }, { status: 400 });
  const clientes = (clientesRaw ?? []) as Array<{
    id: string; empresa: string | null; nombre_contacto: string | null;
    documento: string | null; ruc: string | null;
  }>;

  if (clientes.length === 0) {
    return corsJson({
      success: true,
      data: {
        cliente: null,
        resumen: { total_pendiente: 0, total_vencido: 0, cuotas_pendientes: 0, proxima_cuota: null },
        cuotas: [],
      },
    });
  }
  const cliente = clientes[0]!;
  const nombre = (cliente.empresa ?? cliente.nombre_contacto ?? "").trim() || "Cliente";

  // 2) Traer cuentas por cobrar del cliente
  const { data: cuentasRaw, error: errCu } = await supabase
    .from("cuentas_por_cobrar")
    .select("id, numero_venta, fecha_emision, fecha_vencimiento, moneda, total, saldo, estado, numero_cuota, total_cuotas")
    .eq("empresa_id", empresaId)
    .eq("cliente_id", cliente.id)
    .neq("estado", "anulado")
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

  if (errCu) return corsJson({ success: false, error: errCu.message }, { status: 400 });
  const cuentas = (cuentasRaw ?? []) as Array<{
    id: string; numero_venta: string | null; fecha_emision: string | null;
    fecha_vencimiento: string | null; moneda: string; total: number | string;
    saldo: number | string; estado: string;
    numero_cuota: number | null; total_cuotas: number | null;
  }>;

  const hoy = new Date().toISOString().slice(0, 10);
  let total_pendiente = 0;
  let total_vencido = 0;
  let cuotas_pendientes = 0;
  let proxima_cuota: { numero: string | null; vencimiento: string | null; saldo: number } | null = null;

  const cuotas = cuentas.map((c) => {
    const total = Number(c.total) || 0;
    const saldo = Number(c.saldo) || 0;
    const pagado = Math.max(0, total - saldo);
    const venc = fmtFecha(c.fecha_vencimiento);
    const vencida = venc != null && venc < hoy && saldo > 0;
    const dias_mora = vencida && venc
      ? Math.max(0, Math.round((Date.parse(hoy) - Date.parse(venc)) / 86400000))
      : 0;

    let estadoCalc: "pagado" | "parcial" | "pendiente" | "vencido" = "pendiente";
    if (saldo <= 0) estadoCalc = "pagado";
    else if (vencida) estadoCalc = "vencido";
    else if (pagado > 0) estadoCalc = "parcial";

    if (saldo > 0) {
      total_pendiente += saldo;
      cuotas_pendientes += 1;
      if (vencida) total_vencido += saldo;
      if (!proxima_cuota && !vencida) {
        proxima_cuota = { numero: c.numero_venta, vencimiento: venc, saldo };
      }
    }

    return {
      id: c.id,
      numero: c.numero_venta,
      numero_cuota: c.numero_cuota,
      total_cuotas: c.total_cuotas,
      fecha_emision: fmtFecha(c.fecha_emision),
      fecha_vencimiento: venc,
      moneda: c.moneda,
      total,
      pagado,
      saldo,
      estado: estadoCalc,
      dias_mora,
      // El schema no almacena interés/multa explícitos; quedan en 0 hasta que
      // se agregue su cálculo en el módulo Pagos.
      interes: 0,
      multa: 0,
    };
  });

  return corsJson({
    success: true,
    data: {
      cliente: {
        id: cliente.id,
        nombre,
        documento: cliente.documento,
        ruc: cliente.ruc,
      },
      resumen: {
        total_pendiente,
        total_vencido,
        cuotas_pendientes,
        proxima_cuota,
      },
      cuotas,
    },
  });
}
