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

function dateOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function buildPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if ("titulo" in body) patch.titulo = s(body.titulo);
  if ("descripcion" in body) patch.descripcion = s(body.descripcion);
  if ("banner_url" in body) patch.banner_url = s(body.banner_url);
  if ("badge" in body) patch.badge = s(body.badge);
  if ("valida_hasta" in body) patch.valida_hasta = dateOrNull(body.valida_hasta);
  if ("cta_label" in body) patch.cta_label = s(body.cta_label);
  if ("cta_url" in body) patch.cta_url = s(body.cta_url);
  if ("orden" in body) {
    const n = Number(body.orden);
    if (Number.isFinite(n)) patch.orden = Math.trunc(n);
  }
  if ("activo" in body) patch.activo = body.activo === true;
  if ("destacada" in body) patch.destacada = body.destacada === true;
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
      .from("promociones")
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
      .from("promociones")
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
