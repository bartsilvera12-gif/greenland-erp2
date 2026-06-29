/**
 * Lógica compartida de "consulta de deudas de un cliente". Usada por:
 * - GET  /api/public/mis-pagos          (portal web público — cliente final)
 * - POST /api/bancard/deudas/consultar  (web service para Bancard, requiere X-Api-Key)
 *
 * Devuelve el shape canónico: { cliente, resumen, cuotas }.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export type CuotaConsulta = {
  id: string;
  numero: string | null;
  numero_cuota: number | null;
  total_cuotas: number | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  moneda: string;
  total: number;
  pagado: number;
  saldo: number;
  estado: "pagado" | "parcial" | "pendiente" | "vencido";
  dias_mora: number;
  interes: number;
  multa: number;
};

export type ConsultaResultado = {
  cliente: { id: string; nombre: string; documento: string | null; ruc: string | null } | null;
  resumen: {
    total_pendiente: number;
    total_vencido: number;
    cuotas_pendientes: number;
    proxima_cuota: { numero: string | null; vencimiento: string | null; saldo: number } | null;
  };
  cuotas: CuotaConsulta[];
};

export function normalizarDoc(s: string): string {
  return s.replace(/[\s.\-]/g, "").trim();
}

function fmtFecha(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

export async function consultarDeudasPorDocumento(
  supabase: AppSupabaseClient,
  empresaId: string,
  documentoRaw: string,
): Promise<ConsultaResultado> {
  const doc = documentoRaw.trim();
  const norm = normalizarDoc(doc);

  const empty: ConsultaResultado = {
    cliente: null,
    resumen: { total_pendiente: 0, total_vencido: 0, cuotas_pendientes: 0, proxima_cuota: null },
    cuotas: [],
  };

  if (!norm || norm.length < 4) return empty;

  // 1) Buscar cliente por documento o RUC (matcheando normalizado y crudo)
  const { data: clientesRaw } = await supabase
    .from("clientes")
    .select("id, empresa, nombre_contacto, documento, ruc")
    .eq("empresa_id", empresaId)
    .or(`documento.eq.${norm},ruc.eq.${norm},documento.eq.${doc},ruc.eq.${doc}`);

  const clientes = (clientesRaw ?? []) as Array<{
    id: string; empresa: string | null; nombre_contacto: string | null;
    documento: string | null; ruc: string | null;
  }>;
  if (clientes.length === 0) return empty;

  const cliente = clientes[0]!;
  const nombre = (cliente.empresa ?? cliente.nombre_contacto ?? "").trim() || "Cliente";

  // 2) Cuentas por cobrar
  const { data: cuentasRaw } = await supabase
    .from("cuentas_por_cobrar")
    .select("id, numero_venta, fecha_emision, fecha_vencimiento, moneda, total, saldo, estado, numero_cuota, total_cuotas")
    .eq("empresa_id", empresaId)
    .eq("cliente_id", cliente.id)
    .neq("estado", "anulado")
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

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
  let proxima_cuota: ConsultaResultado["resumen"]["proxima_cuota"] = null;

  const cuotas: CuotaConsulta[] = cuentas.map((c) => {
    const total = Number(c.total) || 0;
    const saldo = Number(c.saldo) || 0;
    const pagado = Math.max(0, total - saldo);
    const venc = fmtFecha(c.fecha_vencimiento);
    const vencida = venc != null && venc < hoy && saldo > 0;
    const dias_mora = vencida && venc
      ? Math.max(0, Math.round((Date.parse(hoy) - Date.parse(venc)) / 86400000))
      : 0;

    let estadoCalc: CuotaConsulta["estado"] = "pendiente";
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
      total, pagado, saldo,
      estado: estadoCalc,
      dias_mora,
      interes: 0,
      multa: 0,
    };
  });

  return {
    cliente: {
      id: cliente.id,
      nombre,
      documento: cliente.documento,
      ruc: cliente.ruc,
    },
    resumen: { total_pendiente, total_vencido, cuotas_pendientes, proxima_cuota },
    cuotas,
  };
}
