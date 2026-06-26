import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  PROPIEDADES_IMAGENES_BUCKET,
  buildPropiedadImagenPath,
  ensurePropiedadesImagenesBucket,
  pathBelongsToEmpresa,
  signPropiedadImagen,
} from "@/lib/propiedades/imagen-storage";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

async function fetchPropiedad(
  sb: AppSupabaseClient,
  empresaId: string,
  propiedadId: string,
): Promise<{ id: string; imagen_path: string | null } | null> {
  const { data, error } = await sb
    .from("propiedades")
    .select("id, imagen_path")
    .eq("empresa_id", empresaId)
    .eq("id", propiedadId)
    .maybeSingle();
  if (error) return null;
  return (data as { id: string; imagen_path: string | null } | null) ?? null;
}

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const prop = await fetchPropiedad(ctx.supabase, ctx.auth.empresa_id, id);
    if (!prop) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const signed = prop.imagen_path
      ? await signPropiedadImagen(ctx.supabase, prop.imagen_path, 3600)
      : null;
    return NextResponse.json(successResponse({ imagen_path: prop.imagen_path, imagen_url: signed }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function POST(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    const prop = await fetchPropiedad(supabase, empresaId, id);
    if (!prop) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const form = await request.formData();
    const file = form.get("file");
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
      await ensurePropiedadesImagenesBucket(supabase);
    } catch {
      /* continuar — el bucket puede existir y el getBucket fallar por permisos */
    }

    if (prop.imagen_path && pathBelongsToEmpresa(prop.imagen_path, empresaId)) {
      await supabase.storage.from(PROPIEDADES_IMAGENES_BUCKET).remove([prop.imagen_path]);
    }

    const path = buildPropiedadImagenPath(empresaId, id, file.type);
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await supabase.storage
      .from(PROPIEDADES_IMAGENES_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true });
    if (up.error) {
      return NextResponse.json(errorResponse(`No se pudo subir la imagen: ${up.error.message}`), { status: 500 });
    }

    const upd = await supabase
      .from("propiedades")
      .update({ imagen_path: path })
      .eq("empresa_id", empresaId)
      .eq("id", id)
      .select("id, imagen_path")
      .maybeSingle();
    if (upd.error) {
      return NextResponse.json(errorResponse("No se pudo asociar la imagen."), { status: 500 });
    }

    const signed = await signPropiedadImagen(supabase, path, 3600);
    return NextResponse.json(successResponse({ imagen_path: path, imagen_url: signed }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    const prop = await fetchPropiedad(supabase, empresaId, id);
    if (!prop) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    if (prop.imagen_path && pathBelongsToEmpresa(prop.imagen_path, empresaId)) {
      await supabase.storage.from(PROPIEDADES_IMAGENES_BUCKET).remove([prop.imagen_path]);
    }
    await supabase
      .from("propiedades")
      .update({ imagen_path: null })
      .eq("empresa_id", empresaId)
      .eq("id", id);

    return NextResponse.json(successResponse({ imagen_path: null, imagen_url: null }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
