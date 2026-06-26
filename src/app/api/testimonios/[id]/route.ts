import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function s(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function buildPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if ("autor" in body) patch.autor = s(body.autor);
  if ("rol" in body) patch.rol = s(body.rol);
  if ("ciudad" in body) patch.ciudad = s(body.ciudad);
  if ("contenido" in body) patch.contenido = s(body.contenido);
  if ("foto_url" in body) patch.foto_url = s(body.foto_url);
  if ("calificacion" in body) {
    const n = Number(body.calificacion);
    if (Number.isFinite(n)) patch.calificacion = Math.min(5, Math.max(1, Math.trunc(n)));
  }
  if ("orden" in body) {
    const n = Number(body.orden);
    if (Number.isFinite(n)) patch.orden = Math.trunc(n);
  }
  if ("activo" in body) patch.activo = body.activo === true;
  if ("destacado" in body) patch.destacado = body.destacado === true;
  return patch;
}

export async function PATCH(request: NextRequest, ctxP: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxP.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("id inválido"), { status: 400 });
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    const body = (await request.json()) as Record<string, unknown>;
    const patch = buildPatch(body);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(errorResponse("Sin campos para actualizar"), { status: 400 });
    }
    const { data, error } = await supabase
      .from("testimonios")
      .update(patch)
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctxP: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxP.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("id inválido"), { status: 400 });
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    const { error } = await supabase
      .from("testimonios")
      .delete()
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id);
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
