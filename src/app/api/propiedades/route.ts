import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";
import { signPropiedadImagen } from "@/lib/propiedades/imagen-storage";

const TIPOS_VALIDOS = new Set([
  "casa",
  "departamento",
  "duplex",
  "terreno",
  "local",
  "oficina",
  "deposito",
  "otro",
]);
const OPERACIONES_VALIDAS = new Set(["alquiler", "venta", "alquiler_temporario"]);
const ESTADOS_VALIDOS = new Set(["disponible", "reservada", "alquilada", "vendida", "inactiva"]);

function normTipo(v: unknown): string {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return TIPOS_VALIDOS.has(s) ? s : "otro";
}

function normOperacion(v: unknown): string {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return OPERACIONES_VALIDAS.has(s) ? s : "alquiler";
}

function normEstado(v: unknown): string {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return ESTADOS_VALIDOS.has(s) ? s : "disponible";
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  return n == null ? null : Math.trunc(n);
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;

    const { data, error } = await supabase
      .from("propiedades")
      .select("*")
      .eq("empresa_id", auth.empresa_id)
      .order("destacada", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }
    const rows = (data ?? []) as Array<Record<string, unknown> & { imagen_path?: string | null }>;
    const withSigned = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        imagen_url: r.imagen_path ? await signPropiedadImagen(supabase, r.imagen_path, 3600) : null,
      })),
    );
    return NextResponse.json(successResponse(withSigned));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;
    const body = (await request.json()) as Record<string, unknown>;

    const titulo = strOrNull(body.titulo);
    if (!titulo) {
      return NextResponse.json(errorResponse("titulo es obligatorio"), { status: 400 });
    }

    const insert = {
      empresa_id: auth.empresa_id,
      codigo: strOrNull(body.codigo),
      titulo,
      descripcion: strOrNull(body.descripcion),
      tipo: normTipo(body.tipo),
      operacion: normOperacion(body.operacion),
      estado: normEstado(body.estado),
      ciudad: strOrNull(body.ciudad),
      barrio: strOrNull(body.barrio),
      direccion: strOrNull(body.direccion),
      lat: numOrNull(body.lat),
      lng: numOrNull(body.lng),
      precio: numOrNull(body.precio),
      moneda: typeof body.moneda === "string" && body.moneda.toUpperCase() === "USD" ? "USD" : "PYG",
      dormitorios: intOrNull(body.dormitorios),
      banos: intOrNull(body.banos),
      cocheras: intOrNull(body.cocheras),
      superficie_m2: numOrNull(body.superficie_m2),
      terreno_m2: numOrNull(body.terreno_m2),
      destacada: body.destacada === true,
      visible_web: body.visible_web !== false,
      activo: body.activo !== false,
    };

    const { data, error } = await supabase.from("propiedades").insert([insert]).select().single();
    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
