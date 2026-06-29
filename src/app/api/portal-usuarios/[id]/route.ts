import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function s(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export async function PATCH(request: NextRequest, ctxP: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxP.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("id inválido"), { status: 400 });
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    const body = (await request.json()) as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    if ("email" in body) {
      const e = s(body.email, 120)?.toLowerCase();
      if (!e) return NextResponse.json(errorResponse("email inválido"), { status: 400 });
      patch.email = e;
    }
    if ("nombre" in body) {
      const n = s(body.nombre, 120);
      if (!n) return NextResponse.json(errorResponse("nombre inválido"), { status: 400 });
      patch.nombre = n;
    }
    if ("rol" in body) patch.rol = s(body.rol, 40) ?? "empleado";
    if ("activo" in body) patch.activo = body.activo === true;
    if ("password" in body) {
      const pw = typeof body.password === "string" ? body.password : "";
      if (pw.length < 6) return NextResponse.json(errorResponse("password mínimo 6 caracteres"), { status: 400 });
      patch.password_hash = await bcrypt.hash(pw, 10);
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(errorResponse("Sin cambios"), { status: 400 });
    }

    const { data, error } = await supabase
      .from("portal_usuarios")
      .update(patch)
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .select("id, email, nombre, rol, activo, last_login_at, created_at")
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
      .from("portal_usuarios")
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
