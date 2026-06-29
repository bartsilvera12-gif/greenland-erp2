import { NextRequest } from "next/server";
import { corsJson, corsPreflight, getPublicSupabase, resolvePublicEmpresaId } from "@/lib/public-api/cors";
import { consultarDeudasPorDocumento } from "@/lib/bancard/consulta";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * GET /api/public/mis-pagos?ci=2321486
 * GET /api/public/mis-pagos?ruc=80012345-6
 *
 * Endpoint PUBLICO (sin auth) usado por el portal web greenlandpy.com/mis-pagos.html
 * — el cliente final consulta su propia deuda. Bancard NO usa este endpoint;
 * tiene el suyo dedicado en /api/bancard/deudas/consultar (POST + X-Api-Key).
 */
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const ci = sp.get("ci");
  const ruc = sp.get("ruc");
  const doc = (ci ?? ruc ?? "").trim();
  if (!doc) {
    return corsJson({ success: false, error: "Falta ci o ruc en la query" }, { status: 400 });
  }
  if (doc.length < 4) {
    return corsJson({ success: false, error: "Documento demasiado corto" }, { status: 400 });
  }

  const supabase = getPublicSupabase();
  const empresaId = await resolvePublicEmpresaId(supabase);
  if (!empresaId) return corsJson({ success: false, error: "empresa no resuelta" }, { status: 500 });

  const data = await consultarDeudasPorDocumento(supabase, empresaId, doc);
  return corsJson({ success: true, data });
}
