import { createHmac, timingSafeEqual } from "crypto";

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function trackingSecret() {
  return (
    process.env.PORTAL_TRACKING_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    null
  );
}

export function hasPortalTrackingConfig() {
  return trackingSecret() !== null;
}

function sign(payload: string) {
  const secret = trackingSecret();
  if (!secret) throw new Error("Portal tracking secret is not configured");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createPortalTrackingToken(input: {
  reference: string;
  email: string;
  companyId: string;
  ttlMs?: number;
}) {
  const exp = Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS);
  const body = [
    input.reference.trim().toUpperCase(),
    input.email.trim().toLowerCase(),
    input.companyId,
    String(exp),
  ].join("|");
  return `${Buffer.from(body, "utf8").toString("base64url")}.${sign(body)}`;
}

export function verifyPortalTrackingToken(token: string | null | undefined) {
  if (!token || !token.includes(".")) return null;
  const secret = trackingSecret();
  if (!secret) return null;

  const [encodedBody, signature] = token.split(".");
  if (!encodedBody || !signature) return null;

  let body: string;
  try {
    body = Buffer.from(encodedBody, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = sign(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  const [reference, email, companyId, expRaw] = body.split("|");
  const exp = Number(expRaw);
  if (!reference || !email?.includes("@") || !companyId || !Number.isFinite(exp)) return null;
  if (Date.now() > exp) return null;

  return {
    reference: reference.toUpperCase(),
    email: email.toLowerCase(),
    companyId,
    exp,
  };
}

export function extractPortalTrackingToken(request: Request, formData?: FormData | null) {
  const header = request.headers.get("x-portal-tracking-token")?.trim();
  if (header) return header;

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token")?.trim();
  if (queryToken) return queryToken;

  if (formData) {
    const formToken = String(formData.get("token") || "").trim();
    if (formToken) return formToken;
  }

  return null;
}
