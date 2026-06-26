/**
 * Helper genérico para subir imágenes públicas (bucket público) asociadas a una
 * entidad de la empresa. Usado por Promociones y Testimonios, cuyas fotos se
 * sirven luego desde greenlandpy.com sin firma.
 *
 * Bucket: `greenland-public` (público).
 * Path:   `{empresa_id}/{entidad}/{id}.{ext}`
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const PUBLIC_MEDIA_BUCKET = "greenland-public";

export const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
export const ALLOWED_IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

let bucketEnsured = false;

export async function ensurePublicMediaBucket(supabase: AppSupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  try {
    const { data: existing } = await supabase.storage.getBucket(PUBLIC_MEDIA_BUCKET);
    if (existing) {
      bucketEnsured = true;
      return;
    }
  } catch {
    /* fallthrough */
  }
  const { error: createErr } = await supabase.storage.createBucket(PUBLIC_MEDIA_BUCKET, {
    public: true,
    fileSizeLimit: MAX_IMAGE_BYTES,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (createErr && !/already exists|duplicate/i.test(createErr.message)) {
    throw new Error(`No se pudo crear el bucket: ${createErr.message}`);
  }
  bucketEnsured = true;
}

export function buildEntityImagenPath(empresaId: string, entidad: string, id: string, mime: string): string {
  const ext = ALLOWED_IMAGE_EXT[mime] ?? "bin";
  return `${empresaId}/${entidad}/${id}.${ext}`;
}

export function getPublicUrl(supabase: AppSupabaseClient, path: string): string {
  const { data } = supabase.storage.from(PUBLIC_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function pathBelongsToEmpresa(path: string | null | undefined, empresaId: string): boolean {
  if (!path) return false;
  return path.split("/")[0] === empresaId;
}
