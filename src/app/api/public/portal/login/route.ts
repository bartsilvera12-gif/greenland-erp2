import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { corsJson, corsPreflight, getPublicSupabase } from "@/lib/public-api/cors";
import { signPortalToken } from "@/lib/portal-auth/jwt";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return corsJson({ success: false, error: "JSON inválido" }, { status: 400 });

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return corsJson({ success: false, error: "Email y contraseña requeridos" }, { status: 400 });
    }

    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from("portal_usuarios")
      .select("id, empresa_id, email, password_hash, nombre, rol, activo")
      .ilike("email", email)
      .eq("activo", true)
      .limit(1);

    if (error) {
      console.error("[portal/login] lookup:", error.message);
      return corsJson({ success: false, error: "Credenciales inválidas" }, { status: 401 });
    }
    const user = (data ?? [])[0] as
      | { id: string; empresa_id: string; email: string; password_hash: string; nombre: string; rol: string; activo: boolean }
      | undefined;
    if (!user) return corsJson({ success: false, error: "Credenciales inválidas" }, { status: 401 });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return corsJson({ success: false, error: "Credenciales inválidas" }, { status: 401 });

    // Best-effort: actualizar last_login_at
    try {
      await supabase
        .from("portal_usuarios")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", user.id);
    } catch { /* no bloquea */ }

    const token = await signPortalToken({
      uid: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
      empresa_id: user.empresa_id,
    });

    return corsJson({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return corsJson({ success: false, error: msg }, { status: 500 });
  }
}
