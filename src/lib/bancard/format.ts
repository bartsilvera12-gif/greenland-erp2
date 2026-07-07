import { NextResponse } from "next/server";
import { CORS_HEADERS } from "@/lib/public-api/cors";

/**
 * Helper de formato para respuestas al estándar del PDF de Bancard
 * "Especificación del API necesario en los Facturadores · Servicio de Cobranzas".
 *
 * Todos los responses deben tener el shape:
 *   { status: "success"|"error", tid: <long>, messages: [{ level, key, dsc:[] }], ... }
 *
 * El header `Server` es requerido por la spec.
 */

export type BancardStatus = "success" | "error";
export type BancardLevel = "success" | "error" | "warning" | "info";

export interface BancardMessage {
  level: BancardLevel;
  key: string;
  dsc: string[];
}

const SERVER_NAME = "Green Land Cobranzas API v1";

export function bancardJson(
  tid: number,
  status: BancardStatus,
  messages: BancardMessage[],
  extras?: Record<string, unknown>,
  httpStatus = 200,
): NextResponse {
  const body = { status, tid, messages, ...(extras ?? {}) };
  return new NextResponse(JSON.stringify(body), {
    status: httpStatus,
    headers: {
      "Content-Type": "application/json",
      "Server": SERVER_NAME,
      ...CORS_HEADERS,
    },
  });
}

export function parseTid(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

export function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter((s) => s.length > 0);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

/** Convierte YYYYMMDD o YYYY-MM-DD a ISO YYYY-MM-DD. Devuelve null si inválido. */
export function parseTrnDat(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return null;
}
