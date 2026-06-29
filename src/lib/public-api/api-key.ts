import { NextRequest } from "next/server";
import { corsJson } from "./cors";

/**
 * Valida header `X-Api-Key` contra env `EXTERNAL_PAYMENT_API_KEY`. Si no
 * coincide o falta, devuelve 401. Si está OK devuelve el partner_id resuelto
 * desde `X-Partner-Id` (o "default" si no vino).
 *
 * Para soportar múltiples partners, en futuro podemos cambiar EXTERNAL_PAYMENT_API_KEY
 * por una tabla `payment_partners` con (partner_id, api_key_hash). Por ahora un solo
 * secret compartido alcanza.
 */
export function requireApiKey(req: NextRequest | Request): { partner_id: string } | Response {
  const expected = process.env.EXTERNAL_PAYMENT_API_KEY?.trim();
  if (!expected || expected.length < 16) {
    return corsJson(
      { success: false, error: "EXTERNAL_PAYMENT_API_KEY no configurada" },
      { status: 500 },
    );
  }
  const got = (req.headers.get("x-api-key") ?? "").trim();
  if (!got || got !== expected) {
    return corsJson({ success: false, error: "API key inválida" }, { status: 401 });
  }
  const partner = (req.headers.get("x-partner-id") ?? "").trim() || "default";
  return { partner_id: partner.slice(0, 60) };
}

export function clientIp(req: NextRequest | Request): string | null {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0]?.trim() || null;
}
