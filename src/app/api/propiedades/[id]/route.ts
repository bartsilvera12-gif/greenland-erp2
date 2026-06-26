import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function buildPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if ("codigo" in body) patch.codigo = strOrNull(body.codigo);
  if ("titulo" in body) {
    const t = strOrNull(body.titulo);
    if (t) patch.titulo = t;
  }
  if ("descripcion" in body) patch.descripcion = strOrNull(body.descripcion);
  if ("tipo" in body && typeof body.tipo === "string" && TIPOS_VALIDOS.has(body.tipo.toLowerCase())) {
    patch.tipo = body.tipo.toLowerCase();
  }
  if (
    "operacion" in body &&
    typeof body.operacion === "string" &&
    OPERACIONES_VALIDAS.has(body.operacion.toLowerCase())
  ) {
    patch.operacion = body.operacion.toLowerCase();
  }
  if (
    "estado" in body &&
    typeof body.estado === "string" &&
    ESTADOS_VALIDOS.has(body.estado.toLowerCase())
  ) {
    patch.estado = body.estado.toLowerCase();
  }
  if ("ciudad" in body) patch.ciudad = strOrNull(body.ciudad);
  if ("barrio" in body) patch.barrio = strOrNull(body.barrio);
  if ("direccion" in body) patch.direccion = strOrNull(body.direccion);
  if ("lat" in body) patch.lat = numOrNull(body.lat);
  if ("lng" in body) patch.lng = numOrNull(body.lng);
  if ("precio" in body) patch.precio = numOrNull(body.precio);
  if ("moneda" in body && typeof body.moneda === "string") {
    patch.moneda = body.moneda.toUpperCase() === "USD" ? "USD" : "PYG";
  }
  if ("dormitorios" in body) patch.dormitorios = intOrNull(body.dormitorios);
  if ("banos" in body) patch.banos = intOrNull(body.banos);
  if ("cocheras" in body) patch.cocheras = intOrNull(body.cocheras);
  if ("superficie_m2" in body) patch.superficie_m2 = numOrNull(body.superficie_m2);
  if ("terreno_m2" in body) patch.terreno_m2 = numOrNull(body.terreno_m2);
  if ("destacada" in body) patch.destacada = body.destacada === true;
  if ("visible_web" in body) patch.visible_web = body.visible_web !== false;
  if ("activo" in body) patch.activo = body.activo !== false;
  if ("modalidad" in body) patch.modalidad = strOrNull(body.modalidad);
  if ("cuotas_cantidad" in body) patch.cuotas_cantidad = intOrNull(body.cuotas_cantidad);
  if ("cuota_monto" in body) patch.cuota_monto = numOrNull(body.cuota_monto);
  if ("servicios" in body) patch.servicios = Array.isArray(body.servicios) ? body.servicios : [];
  if ("medidas" in body) patch.medidas = typeof body.medidas === "object" && body.medidas !== null ? body.medidas : {};
  if ("finca" in body) patch.finca = strOrNull(body.finca);
  if ("padron" in body) patch.padron = strOrNull(body.padron);
  if ("cuenta_catastral" in body) patch.cuenta_catastral = strOrNull(body.cuenta_catastral);
  return patch;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(errorResponse("id inválido"), { status: 400 });
    }
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;
    const { data, error } = await supabase
      .from("propiedades")
      .select("*")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }
    if (!data) {
      return NextResponse.json(errorResponse("Propiedad no encontrada"), { status: 404 });
    }
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(errorResponse("id inválido"), { status: 400 });
    }
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;
    const body = (await request.json()) as Record<string, unknown>;
    const patch = buildPatch(body);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(errorResponse("Sin campos para actualizar"), { status: 400 });
    }
    const { data, error } = await supabase
      .from("propiedades")
      .update(patch)
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }
    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(errorResponse("id inválido"), { status: 400 });
    }
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;
    const { error } = await supabase
      .from("propiedades")
      .delete()
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id);
    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
