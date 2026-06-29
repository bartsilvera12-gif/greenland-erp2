import { NextRequest } from "next/server";
import { corsJson } from "@/lib/public-api/cors";
import { tokenFromRequest, verifyPortalToken, type PortalSession } from "./jwt";

/**
 * Helper: extrae y valida el token del request. Si falla, devuelve la response
 * 401. Si OK, devuelve la sesión.
 *
 * Uso:
 *   const r = await requirePortalSession(req);
 *   if (r instanceof Response) return r;
 *   const session = r;
 */
export async function requirePortalSession(req: NextRequest | Request): Promise<PortalSession | Response> {
  const token = tokenFromRequest(req);
  if (!token) return corsJson({ success: false, error: "Falta token" }, { status: 401 });
  const session = await verifyPortalToken(token);
  if (!session) return corsJson({ success: false, error: "Token inválido o expirado" }, { status: 401 });
  return session;
}
