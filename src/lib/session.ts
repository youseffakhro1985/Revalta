import { SignJWT, jwtVerify } from "jose";

const secretKey = new TextEncoder().encode(
  process.env.JWT_SECRET || "revalta_super_secret_key_2026"
);

export type SessionPayload = {
  sub: string;
  email: string;
  companyId?: string;
  role?: string;
};

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secretKey);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as SessionPayload;
  } catch (err) {
    return null;
  }
}
