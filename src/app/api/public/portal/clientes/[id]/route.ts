import { NextRequest } from "next/server";
import { corsJson, corsPreflight, getPublicSupabase } from "@/lib/public-api/cors";
import { requirePortalSession } from "@/lib/portal-auth/require-session";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/public/portal/clientes/:id  (Bearer JWT)
 * Detalle del cliente: datos básicos + listado de cuotas con estado calculado.
 */
export async function GET(request: NextRequest, ctxP: { params: Promise<{ id: string }> }) {
  const { id } = await ctxP.params;
  if (!UUID_RE.test(id)) return corsJson({ success: false, error: "id inválido" }, { status: 400 });

  const session = await requirePortalSession(request);
  if (session instanceof Response) return session;

  const supabase = getPublicSupabase();
  const { data: cliRaw, error: errCli } = await supabase
    .from("clientes")
    .select("id, empresa, nombre_contacto, documento, ruc, telefono, email")
    .eq("empresa_id", session.empresa_id)
    .eq("id", id)
    .maybeSingle();

  if (errCli) return corsJson({ success: false, error: errCli.message }, { status: 400 });
  if (!cliRaw) return corsJson({ success: false, error: "Cliente no encontrado" }, { status: 404 });

  const cli = cliRaw as { id: string; empresa: string | null; nombre_contacto: string | null; documento: string | null; ruc: string | null; telefono?: string | null; email?: string | null };

  const { data: cxcRaw, error: errCxc } = await supabase
    .from("cuentas_por_cobrar")
    .select("id, numero_venta, fecha_emision, fecha_vencimiento, moneda, total, saldo, estado")
    .eq("empresa_id", session.empresa_id)
    .eq("cliente_id", id)
    .neq("estado", "anulado")
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

  if (errCxc) return corsJson({ success: false, error: errCxc.message }, { status: 400 });
  const cuentas = (cxcRaw ?? []) as Array<{
    id: string; numero_venta: string | null; fecha_emision: string | null;
    fecha_vencimiento: string | null; moneda: string; total: number | string;
    saldo: number | string; estado: string;
  }>;

  const hoy = new Date().toISOString().slice(0, 10);
  let total_pendiente = 0;
  let total_vencido = 0;

  const cuotas = cuentas.map((c) => {
    const total = Number(c.total) || 0;
    const saldo = Number(c.saldo) || 0;
    const pagado = Math.max(0, total - saldo);
    const venc = c.fecha_vencimiento ? c.fecha_vencimiento.slice(0, 10) : null;
    const vencida = venc != null && venc < hoy && saldo > 0;
    const dias_mora = vencida && venc
      ? Math.max(0, Math.round((Date.parse(hoy) - Date.parse(venc)) / 86400000))
      : 0;
    let estadoCalc: "pagado" | "parcial" | "pendiente" | "vencido" = "pendiente";
    if (saldo <= 0) estadoCalc = "pagado";
    else if (vencida) estadoCalc = "vencido";
    else if (pagado > 0) estadoCalc = "parcial";

    if (saldo > 0) { total_pendiente += saldo; if (vencida) total_vencido += saldo; }

    return {
      id: c.id,
      numero: c.numero_venta,
      fecha_emision: c.fecha_emision ? c.fecha_emision.slice(0, 10) : null,
      fecha_vencimiento: venc,
      moneda: c.moneda,
      total, pagado, saldo,
      estado: estadoCalc,
      dias_mora,
    };
  });

  return corsJson({
    success: true,
    data: {
      cliente: {
        id: cli.id,
        nombre: (cli.empresa ?? cli.nombre_contacto ?? "").trim() || "Cliente",
        documento: cli.documento,
        ruc: cli.ruc,
        telefono: cli.telefono ?? null,
        email: cli.email ?? null,
      },
      resumen: { total_pendiente, total_vencido, cuotas: cuotas.length },
      cuotas,
    },
  });
}
