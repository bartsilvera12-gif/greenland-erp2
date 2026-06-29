import { NextRequest } from "next/server";
import { corsJson, corsPreflight, getPublicSupabase } from "@/lib/public-api/cors";
import { requirePortalSession } from "@/lib/portal-auth/require-session";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

/**
 * GET /api/public/portal/clientes  (Bearer JWT)
 * Lista clientes con resumen agregado de cuentas_por_cobrar.
 * Soporta ?q=texto para filtrar por nombre/documento/ruc.
 */
export async function GET(request: NextRequest) {
  const session = await requirePortalSession(request);
  if (session instanceof Response) return session;

  const supabase = getPublicSupabase();
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();

  let qb = supabase
    .from("clientes")
    .select("id, empresa, nombre_contacto, documento, ruc")
    .eq("empresa_id", session.empresa_id)
    .order("empresa", { ascending: true, nullsFirst: false })
    .limit(500);

  if (q) {
    qb = qb.or(`empresa.ilike.%${q}%,nombre_contacto.ilike.%${q}%,documento.ilike.%${q}%,ruc.ilike.%${q}%`);
  }

  const { data: clientesRaw, error: errCli } = await qb;
  if (errCli) return corsJson({ success: false, error: errCli.message }, { status: 400 });
  const clientes = (clientesRaw ?? []) as Array<{
    id: string; empresa: string | null; nombre_contacto: string | null;
    documento: string | null; ruc: string | null;
  }>;

  if (clientes.length === 0) return corsJson({ success: true, data: [] });

  // Una sola query: traer todas las cuentas activas de esos clientes y agrupar en memoria.
  const ids = clientes.map((c) => c.id);
  const { data: cxcRaw, error: errCxc } = await supabase
    .from("cuentas_por_cobrar")
    .select("cliente_id, total, saldo, estado, fecha_vencimiento")
    .eq("empresa_id", session.empresa_id)
    .in("cliente_id", ids)
    .neq("estado", "anulado");

  if (errCxc) return corsJson({ success: false, error: errCxc.message }, { status: 400 });
  const cxc = (cxcRaw ?? []) as Array<{
    cliente_id: string; total: number | string; saldo: number | string;
    estado: string; fecha_vencimiento: string | null;
  }>;

  const hoy = new Date().toISOString().slice(0, 10);
  const resumenPorCliente = new Map<string, { total_pendiente: number; total_vencido: number; cuotas_pendientes: number; proxima_venc: string | null; }>();

  for (const c of cxc) {
    const saldo = Number(c.saldo) || 0;
    if (saldo <= 0) continue;
    const r = resumenPorCliente.get(c.cliente_id) ?? { total_pendiente: 0, total_vencido: 0, cuotas_pendientes: 0, proxima_venc: null as string | null };
    r.total_pendiente += saldo;
    r.cuotas_pendientes += 1;
    const venc = c.fecha_vencimiento ? c.fecha_vencimiento.slice(0, 10) : null;
    if (venc && venc < hoy) r.total_vencido += saldo;
    if (venc && (!r.proxima_venc || venc < r.proxima_venc)) r.proxima_venc = venc;
    resumenPorCliente.set(c.cliente_id, r);
  }

  const result = clientes.map((c) => {
    const r = resumenPorCliente.get(c.id);
    return {
      id: c.id,
      nombre: (c.empresa ?? c.nombre_contacto ?? "").trim() || "Cliente",
      documento: c.documento,
      ruc: c.ruc,
      total_pendiente: r?.total_pendiente ?? 0,
      total_vencido: r?.total_vencido ?? 0,
      cuotas_pendientes: r?.cuotas_pendientes ?? 0,
      proxima_venc: r?.proxima_venc ?? null,
    };
  }).sort((a, b) => b.total_vencido - a.total_vencido || b.total_pendiente - a.total_pendiente);

  return corsJson({ success: true, data: result });
}
