import { NextRequest } from "next/server";
import { corsJson, corsPreflight, getPublicSupabase, resolvePublicEmpresaId } from "@/lib/public-api/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsPreflight();
}

function clean(s: unknown, max = 500): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function normTelefono(s: string): string {
  return s.replace(/[^\d+]/g, "");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/public/consultas
 * Body JSON: { tipo: 'promocion'|'propiedad', entidad_id?: uuid, entidad_titulo?: string,
 *              nombre: string, telefono: string, mensaje?: string }
 *
 * Rate-limit suave: máx 6 inserts por IP por hora.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return corsJson({ success: false, error: "JSON inválido" }, { status: 400 });

    const tipo = clean(body.tipo);
    const nombre = clean(body.nombre, 120);
    const telefonoRaw = clean(body.telefono, 60);
    const mensaje = clean(body.mensaje, 1000);
    const entidadIdRaw = clean(body.entidad_id, 64);
    const entidadTitulo = clean(body.entidad_titulo, 200);
    const origen = clean(body.origen, 60);

    if (!tipo || (tipo !== "promocion" && tipo !== "propiedad")) {
      return corsJson({ success: false, error: "tipo inválido" }, { status: 400 });
    }
    if (!nombre) return corsJson({ success: false, error: "nombre requerido" }, { status: 400 });
    if (!telefonoRaw) return corsJson({ success: false, error: "teléfono requerido" }, { status: 400 });

    const telefono = normTelefono(telefonoRaw);
    if (telefono.length < 6) {
      return corsJson({ success: false, error: "teléfono inválido" }, { status: 400 });
    }
    const entidad_id = entidadIdRaw && UUID_RE.test(entidadIdRaw) ? entidadIdRaw : null;

    const supabase = getPublicSupabase();
    const empresaId = await resolvePublicEmpresaId(supabase);
    if (!empresaId) return corsJson({ success: false, error: "empresa no resuelta" }, { status: 500 });

    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
    const ua = request.headers.get("user-agent")?.slice(0, 500) ?? null;

    // Rate limit suave por IP (6/hora). Si falla la query, no bloquea el insert.
    if (ip) {
      try {
        const desde = new Date(Date.now() - 3600 * 1000).toISOString();
        const { count } = await supabase
          .from("consultas_landing")
          .select("id", { count: "exact", head: true })
          .eq("ip", ip)
          .gte("created_at", desde);
        if ((count ?? 0) >= 6) {
          return corsJson({ success: false, error: "demasiadas consultas, intentá más tarde" }, { status: 429 });
        }
      } catch {
        /* no bloquear */
      }
    }

    const { data, error } = await supabase
      .from("consultas_landing")
      .insert({
        empresa_id: empresaId,
        tipo,
        entidad_id,
        entidad_titulo: entidadTitulo,
        nombre,
        telefono,
        mensaje,
        ip,
        user_agent: ua,
        origen: origen ?? "greenlandpy.com",
      })
      .select("id, created_at")
      .single();

    if (error) {
      console.error("[public/consultas] insert:", error.message);
      return corsJson({ success: false, error: error.message }, { status: 500 });
    }
    return corsJson({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return corsJson({ success: false, error: msg }, { status: 500 });
  }
}
