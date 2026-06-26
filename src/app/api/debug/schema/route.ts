import { NextResponse } from "next/server";
import { NEURA_CLIENT_SCHEMA, SUPABASE_APP_SCHEMA } from "@/lib/supabase/schema";

/**
 * Endpoint de diagnóstico: devuelve el schema operativo resuelto desde env.
 * Sirve para validar que NEURA_CLIENT_SCHEMA esté llegando al runtime.
 */
export function GET() {
  return NextResponse.json({
    NEURA_CLIENT_SCHEMA_resolved: NEURA_CLIENT_SCHEMA,
    SUPABASE_APP_SCHEMA_resolved: SUPABASE_APP_SCHEMA,
    raw_env: process.env.NEURA_CLIENT_SCHEMA ?? null,
    NEURA_INSTANCE_MODE: process.env.NEURA_INSTANCE_MODE ?? null,
    NEURA_CLIENT_NAME: process.env.NEURA_CLIENT_NAME ?? null,
  });
}
