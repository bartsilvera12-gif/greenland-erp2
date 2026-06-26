import { NextRequest } from "next/server";
import { corsJson, corsPreflight, getPublicSupabase, resolvePublicEmpresaId } from "@/lib/public-api/cors";
import { signPropiedadImagen } from "@/lib/propiedades/imagen-storage";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(_request: NextRequest) {
  const supabase = getPublicSupabase();
  const empresaId = await resolvePublicEmpresaId(supabase);
  if (!empresaId) return corsJson({ success: false, error: "empresa no resuelta" }, { status: 500 });

  const { data, error } = await supabase
    .from("propiedades")
    .select(
      "id, codigo, titulo, descripcion, tipo, operacion, estado, ciudad, barrio, direccion, precio, moneda, dormitorios, banos, cocheras, superficie_m2, terreno_m2, destacada, imagen_path, modalidad, cuotas_cantidad, cuota_monto, servicios, medidas, finca, padron, cuenta_catastral",
    )
    .eq("empresa_id", empresaId)
    .eq("activo", true)
    .eq("visible_web", true)
    .order("destacada", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return corsJson({ success: false, error: error.message }, { status: 400 });

  const rows = (data ?? []) as Array<Record<string, unknown> & { imagen_path?: string | null }>;
  const withSigned = await Promise.all(
    rows.map(async (r) => {
      const { imagen_path, ...rest } = r;
      const imagen_url = imagen_path ? await signPropiedadImagen(supabase, imagen_path, 86400) : null;
      return { ...rest, imagen_url };
    }),
  );

  return corsJson({ success: true, data: withSigned });
}
