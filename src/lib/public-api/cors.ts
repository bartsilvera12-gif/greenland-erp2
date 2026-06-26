import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

/**
 * Headers CORS abiertos. La API pública es de sólo lectura (catálogos y
 * "Mis Pagos" por CI/RUC) y se sirve a greenlandpy.com desde otro dominio.
 */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function corsJson(body: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: CORS_HEADERS,
  });
}

export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Resuelve el `empresa_id` para endpoints públicos en una instancia mono-tenant.
 *
 * 1. Si `GREENLAND_PUBLIC_EMPRESA_ID` está seteada, la usa.
 * 2. Si no, busca la única empresa del schema. Si hay 0 o más de 1, devuelve null.
 */
let cachedEmpresaId: string | null | undefined;

export async function resolvePublicEmpresaId(supabase: AppSupabaseClient): Promise<string | null> {
  if (cachedEmpresaId !== undefined) return cachedEmpresaId;

  const env = process.env.GREENLAND_PUBLIC_EMPRESA_ID?.trim();
  if (env) {
    cachedEmpresaId = env;
    return env;
  }

  try {
    const { data } = await supabase.from("empresas").select("id").limit(2);
    const rows = (data ?? []) as Array<{ id: string }>;
    cachedEmpresaId = rows.length === 1 ? rows[0]!.id : null;
    return cachedEmpresaId;
  } catch {
    cachedEmpresaId = null;
    return null;
  }
}

export function getPublicSupabase(): AppSupabaseClient {
  return createServiceRoleClient();
}
