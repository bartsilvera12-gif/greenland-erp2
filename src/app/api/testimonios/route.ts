import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";

function s(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function int(v: unknown, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;

    const { data, error } = await supabase
      .from("testimonios")
      .select("*")
      .eq("empresa_id", auth.empresa_id)
      .order("orden", { ascending: true })
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

    const autor = s(body.autor);
    const contenido = s(body.contenido);
    if (!autor) return NextResponse.json(errorResponse("autor requerido"), { status: 400 });
    if (!contenido) return NextResponse.json(errorResponse("contenido requerido"), { status: 400 });

    const insert = {
      empresa_id: auth.empresa_id,
      autor,
      rol: s(body.rol),
      ciudad: s(body.ciudad),
      contenido,
      foto_url: s(body.foto_url),
      calificacion: Math.min(5, Math.max(1, int(body.calificacion, 5))),
      orden: int(body.orden, 0),
      activo: body.activo !== false,
      destacado: body.destacado === true,
    };

    const { data, error } = await supabase.from("testimonios").insert([insert]).select().single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
