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

function dateOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  // Acepta YYYY-MM-DD; postgres rechaza el resto
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;

    const { data, error } = await supabase
      .from("promociones")
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

    const titulo = s(body.titulo);
    if (!titulo) return NextResponse.json(errorResponse("titulo requerido"), { status: 400 });

    const insert = {
      empresa_id: auth.empresa_id,
      titulo,
      descripcion: s(body.descripcion),
      banner_url: s(body.banner_url),
      badge: s(body.badge),
      valida_hasta: dateOrNull(body.valida_hasta),
      cta_label: s(body.cta_label) ?? "Quiero esta promoción",
      cta_url: s(body.cta_url),
      orden: int(body.orden, 0),
      activo: body.activo !== false,
      destacada: body.destacada === true,
    };

    const { data, error } = await supabase.from("promociones").insert([insert]).select().single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
