import { NextRequest } from "next/server";
import { corsJson, corsPreflight, getPublicSupabase, resolvePublicEmpresaId } from "@/lib/public-api/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(_request: NextRequest) {
  const supabase = getPublicSupabase();
  const empresaId = await resolvePublicEmpresaId(supabase);
  if (!empresaId) return corsJson({ success: false, error: "empresa no resuelta" }, { status: 500 });

  const { data, error } = await supabase
    .from("testimonios")
    .select("id, autor, rol, ciudad, contenido, foto_url, calificacion, destacado, orden")
    .eq("empresa_id", empresaId)
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) return corsJson({ success: false, error: error.message }, { status: 400 });
  return corsJson({ success: true, data: data ?? [] });
}
