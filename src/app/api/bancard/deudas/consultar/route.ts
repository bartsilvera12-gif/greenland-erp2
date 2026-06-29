import { NextRequest } from "next/server";
import { corsJson, corsPreflight, getPublicSupabase, resolvePublicEmpresaId } from "@/lib/public-api/cors";
import { requireApiKey } from "@/lib/public-api/api-key";
import { consultarDeudasPorDocumento } from "@/lib/bancard/consulta";

export const dynamic = "force-dynamic";

export async function OPTIONS() { return corsPreflight(); }

/**
 * POST /api/bancard/deudas/consultar
 *
 * Headers:
 *   X-Api-Key:     <EXTERNAL_PAYMENT_API_KEY>
 *   X-Partner-Id:  bancard
 *   Content-Type:  application/json
 *
 * Body JSON:
 *   { "tipo_documento": "ci",  "documento": "1111111"   }
 *   { "tipo_documento": "ruc", "documento": "80012345-6" }
 *
 * Response shape idéntico al de /api/public/mis-pagos (campo data).
 */
export async function POST(request: NextRequest) {
  const auth = requireApiKey(request);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown> | null = null;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return corsJson({ success: false, error: "JSON inválido" }, { status: 400 }); }
  if (!body) return corsJson({ success: false, error: "Body vacío" }, { status: 400 });

  const tipoDoc = typeof body.tipo_documento === "string" ? body.tipo_documento.trim().toLowerCase() : "";
  const documento = typeof body.documento === "string" ? body.documento.trim() : "";

  if (tipoDoc !== "ci" && tipoDoc !== "ruc") {
    return corsJson({ success: false, error: "tipo_documento debe ser 'ci' o 'ruc'" }, { status: 400 });
  }
  if (!documento || documento.length < 4) {
    return corsJson({ success: false, error: "documento requerido (min 4 chars)" }, { status: 400 });
  }

  const supabase = getPublicSupabase();
  const empresaId = await resolvePublicEmpresaId(supabase);
  if (!empresaId) return corsJson({ success: false, error: "empresa no resuelta" }, { status: 500 });

  const data = await consultarDeudasPorDocumento(supabase, empresaId, documento);

  // Eco del tipo_documento + partner_id para audit del partner
  return corsJson({
    success: true,
    partner_id: auth.partner_id,
    tipo_documento: tipoDoc,
    data,
  });
}
