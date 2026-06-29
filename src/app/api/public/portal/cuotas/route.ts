import { NextRequest } from "next/server";
import { corsJson, corsPreflight, getPublicSupabase } from "@/lib/public-api/cors";
import { requirePortalSession } from "@/lib/portal-auth/require-session";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

/**
 * GET /api/public/portal/cuotas?filtro=vencidas|por_vencer  (Bearer JWT)
 * Lista de cuotas filtradas. Para el tab "Cobranza" del portal.
 */
export async function GET(request: NextRequest) {
  const session = await requirePortalSession(request);
  if (session instanceof Response) return session;

  const filtro = (new URL(request.url).searchParams.get("filtro") ?? "vencidas").toLowerCase();
  const supabase = getPublicSupabase();
  const hoy = new Date().toISOString().slice(0, 10);
  const en7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  let qb = supabase
    .from("cuentas_por_cobrar")
    .select("id, cliente_id, numero_venta, fecha_vencimiento, moneda, total, saldo, estado")
    .eq("empresa_id", session.empresa_id)
    .neq("estado", "anulado")
    .gt("saldo", 0)
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
    .limit(500);

  if (filtro === "vencidas") qb = qb.lt("fecha_vencimiento", hoy);
  else if (filtro === "por_vencer") qb = qb.gte("fecha_vencimiento", hoy).lte("fecha_vencimiento", en7);

  const { data: cxcRaw, error } = await qb;
  if (error) return corsJson({ success: false, error: error.message }, { status: 400 });
  const cxc = (cxcRaw ?? []) as Array<{
    id: string; cliente_id: string; numero_venta: string | null; fecha_vencimiento: string | null;
    moneda: string; total: number | string; saldo: number | string; estado: string;
  }>;

  if (cxc.length === 0) return corsJson({ success: true, data: [] });

  // Enriquecer con nombre del cliente
  const ids = [...new Set(cxc.map((c) => c.cliente_id))];
  const { data: clRaw } = await supabase
    .from("clientes")
    .select("id, empresa, nombre_contacto")
    .in("id", ids);
  const nombreById = new Map<string, string>();
  for (const c of (clRaw ?? []) as Array<{ id: string; empresa: string | null; nombre_contacto: string | null }>) {
    nombreById.set(c.id, (c.empresa ?? c.nombre_contacto ?? "").trim() || "Cliente");
  }

  const data = cxc.map((c) => {
    const venc = c.fecha_vencimiento ? c.fecha_vencimiento.slice(0, 10) : null;
    const dias_mora = venc && venc < hoy
      ? Math.max(0, Math.round((Date.parse(hoy) - Date.parse(venc)) / 86400000))
      : 0;
    return {
      id: c.id,
      cliente_id: c.cliente_id,
      cliente_nombre: nombreById.get(c.cliente_id) ?? "Cliente",
      numero: c.numero_venta,
      fecha_vencimiento: venc,
      moneda: c.moneda,
      total: Number(c.total) || 0,
      saldo: Number(c.saldo) || 0,
      dias_mora,
    };
  });

  return corsJson({ success: true, data });
}
