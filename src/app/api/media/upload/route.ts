import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  PUBLIC_MEDIA_BUCKET,
  buildEntityImagenPath,
  ensurePublicMediaBucket,
  getPublicUrl,
} from "@/lib/media/empresa-imagen";

const ENTIDADES_PERMITIDAS = new Set(["promociones", "testimonios"]);

/**
 * POST /api/media/upload
 * Form-data: file (jpg/png/webp ≤5MB), entidad ("promociones"|"testimonios"), id (uuid de la entidad)
 * Devuelve: { url } - URL pública persistente (bucket público).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const form = await request.formData();
    const file = form.get("file");
    const entidad = String(form.get("entidad") ?? "").trim();
    const entityId = String(form.get("id") ?? "").trim();

    if (!ENTIDADES_PERMITIDAS.has(entidad)) {
      return NextResponse.json(errorResponse("Entidad inválida"), { status: 400 });
    }
    if (!entityId) {
      return NextResponse.json(errorResponse("Falta id de la entidad"), { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json(errorResponse("Falta el archivo (campo 'file')."), { status: 400 });
    }
    if (!ALLOWED_IMAGE_MIME.has(file.type)) {
      return NextResponse.json(errorResponse("Formato no permitido. Usá JPG, PNG o WebP."), { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const mb = (MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0);
      return NextResponse.json(errorResponse(`Imagen demasiado grande (máx. ${mb} MB).`), { status: 413 });
    }

    try {
      await ensurePublicMediaBucket(supabase);
    } catch {
      /* el bucket puede existir y el getBucket fallar por permisos */
    }

    const path = buildEntityImagenPath(auth.empresa_id, entidad, entityId, file.type);
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await supabase.storage
      .from(PUBLIC_MEDIA_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true });
    if (up.error) {
      return NextResponse.json(errorResponse(`No se pudo subir la imagen: ${up.error.message}`), { status: 500 });
    }

    const url = getPublicUrl(supabase, path);
    return NextResponse.json(successResponse({ url, path }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
