import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";

function s(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;

    const { data, error } = await supabase
      .from("portal_usuarios")
      .select("id, email, nombre, rol, activo, last_login_at, created_at")
      .eq("empresa_id", auth.empresa_id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data ?? []));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    const body = (await request.json()) as Record<string, unknown>;

    const email = s(body.email, 120)?.toLowerCase() ?? null;
    const nombre = s(body.nombre, 120);
    const password = typeof body.password === "string" ? body.password : "";
    const rol = s(body.rol, 40) ?? "empleado";

    if (!email || !nombre) return NextResponse.json(errorResponse("email y nombre requeridos"), { status: 400 });
    if (password.length < 6) return NextResponse.json(errorResponse("password mínimo 6 caracteres"), { status: 400 });

    const password_hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from("portal_usuarios")
      .insert({ empresa_id: auth.empresa_id, email, nombre, password_hash, rol, activo: true })
      .select("id, email, nombre, rol, activo, last_login_at, created_at")
      .single();

    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
