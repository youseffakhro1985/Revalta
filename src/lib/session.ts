import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import {
  SESSION_AUDIENCE,
  SESSION_CLOCK_TOLERANCE_SECONDS,
  SESSION_ISSUER,
  SESSION_TTL_SECONDS,
} from "@/lib/session-policy";

export type SessionPayload = {
  sub: string;
  email: string;
  name?: string | null;
  jti?: string;
};

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, name: payload.name ?? undefined })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setNotBefore("0s")
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload, protectedHeader } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
      clockTolerance: SESSION_CLOCK_TOLERANCE_SECONDS,
    });
    if (protectedHeader.typ !== "JWT" || typeof payload.sub !== "string" || typeof payload.email !== "string" || typeof payload.jti !== "string") return null;
    return { sub: payload.sub, email: payload.email, name: typeof payload.name === "string" ? payload.name : null, jti: payload.jti };
  } catch {
    return null;
  }
}
