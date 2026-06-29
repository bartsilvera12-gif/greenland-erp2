import { NextRequest } from "next/server";
import { corsJson, corsPreflight, getPublicSupabase } from "@/lib/public-api/cors";
import { requirePortalSession } from "@/lib/portal-auth/require-session";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

/**
 * GET /api/public/portal/kpis  (Bearer JWT)
 * Resumen para el dashboard del portal: total pendiente, vencido, cobrado mes,
 * top 5 morosos.
 */
export async function GET(request: NextRequest) {
  const session = await requirePortalSession(request);
  if (session instanceof Response) return session;

  const supabase = getPublicSupabase();
  const hoy = new Date();
  const hoyISO = hoy.toISOString().slice(0, 10);
  const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);

  // Cuentas pendientes (saldo > 0)
  const { data: cxcRaw, error: errCxc } = await supabase
    .from("cuentas_por_cobrar")
    .select("cliente_id, saldo, fecha_vencimiento")
    .eq("empresa_id", session.empresa_id)
    .neq("estado", "anulado")
    .gt("saldo", 0);
  if (errCxc) return corsJson({ success: false, error: errCxc.message }, { status: 400 });
  const cxc = (cxcRaw ?? []) as Array<{ cliente_id: string; saldo: number | string; fecha_vencimiento: string | null }>;

  let total_pendiente = 0;
  let total_vencido = 0;
  const morososMap = new Map<string, number>(); // cliente_id -> total vencido
  for (const c of cxc) {
    const saldo = Number(c.saldo) || 0;
    total_pendiente += saldo;
    const venc = c.fecha_vencimiento ? c.fecha_vencimiento.slice(0, 10) : null;
    if (venc && venc < hoyISO) {
      total_vencido += saldo;
      morososMap.set(c.cliente_id, (morososMap.get(c.cliente_id) ?? 0) + saldo);
    }
  }

  // Cobrado en el mes actual
  const { data: cobrosRaw, error: errCob } = await supabase
    .from("cobros_clientes")
    .select("monto, fecha_pago")
    .eq("empresa_id", session.empresa_id)
    .gte("fecha_pago", primerDiaMes);
  // tabla puede no existir si la instancia usa "cobros" en vez de "cobros_clientes"; degradamos a 0.
  let cobrado_mes = 0;
  if (!errCob && Array.isArray(cobrosRaw)) {
    for (const c of cobrosRaw as Array<{ monto: number | string }>) {
      cobrado_mes += Number(c.monto) || 0;
    }
  }

  // Top 5 morosos: necesitamos los nombres
  const topIds = [...morososMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);
  let topMorosos: Array<{ id: string; nombre: string; total_vencido: number }> = [];
  if (topIds.length > 0) {
    const { data: clRaw } = await supabase
      .from("clientes")
      .select("id, empresa, nombre_contacto")
      .in("id", topIds);
    const nombreById = new Map<string, string>();
    for (const c of (clRaw ?? []) as Array<{ id: string; empresa: string | null; nombre_contacto: string | null }>) {
      nombreById.set(c.id, (c.empresa ?? c.nombre_contacto ?? "").trim() || "Cliente");
    }
    topMorosos = topIds.map((id) => ({
      id,
      nombre: nombreById.get(id) ?? "Cliente",
      total_vencido: morososMap.get(id) ?? 0,
    }));
  }

  return corsJson({
    success: true,
    data: {
      total_pendiente,
      total_vencido,
      cobrado_mes,
      cuentas_pendientes: cxc.length,
      top_morosos: topMorosos,
    },
  });
}
