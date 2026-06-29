import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const ISSUER = "greenland-portal";
const AUDIENCE = "greenland-portal-web";

function getSecret(): Uint8Array {
  const raw = process.env.PORTAL_JWT_SECRET?.trim();
  if (!raw || raw.length < 32) {
    throw new Error("PORTAL_JWT_SECRET no configurada (mínimo 32 chars)");
  }
  return new TextEncoder().encode(raw);
}

export type PortalSession = {
  uid: string;        // portal_usuarios.id
  email: string;
  nombre: string;
  rol: string;
  empresa_id: string;
};

/** Firma un JWT con TTL 8h. */
export async function signPortalToken(session: PortalSession): Promise<string> {
  return new SignJWT({ ...session } as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());
}

/** Verifica y devuelve la sesión o null si inválido/expirado. */
export async function verifyPortalToken(token: string): Promise<PortalSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.uid !== "string" || typeof payload.email !== "string") return null;
    return {
      uid: payload.uid,
      email: payload.email,
      nombre: typeof payload.nombre === "string" ? payload.nombre : "",
      rol: typeof payload.rol === "string" ? payload.rol : "empleado",
      empresa_id: typeof payload.empresa_id === "string" ? payload.empresa_id : "",
    };
  } catch {
    return null;
  }
}

/** Extrae token del header Authorization: Bearer <token> */
export function tokenFromRequest(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1]!.trim() : null;
}
