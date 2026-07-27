import { createHmac, timingSafeEqual } from "crypto";

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_TTL_MS = 1000 * 60 * 60 * 24 * 90;
const MAX_TOKEN_LENGTH = 2_048;
const MAX_REFERENCE_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_COMPANY_ID_LENGTH = 191;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trackingSecret() {
  return (
    process.env.PORTAL_TRACKING_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    null
  );
}

function sign(payload: string) {
  const secret = trackingSecret();
  if (!secret) throw new Error("Portal tracking secret is not configured");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function normalizeTokenInput(input: {
  reference: string;
  email: string;
  companyId: string;
  ttlMs?: number;
}) {
  const reference = input.reference.trim().toUpperCase();
  const email = input.email.trim().toLowerCase();
  const companyId = input.companyId.trim();
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;

  if (
    !reference ||
    reference.length > MAX_REFERENCE_LENGTH ||
    reference.includes("|") ||
    !EMAIL_PATTERN.test(email) ||
    email.length > MAX_EMAIL_LENGTH ||
    email.includes("|") ||
    !companyId ||
    companyId.length > MAX_COMPANY_ID_LENGTH ||
    companyId.includes("|") ||
    !Number.isSafeInteger(ttlMs) ||
    ttlMs <= 0 ||
    ttlMs > MAX_TTL_MS
  ) {
    throw new Error("Invalid portal tracking token input");
  }

  return { reference, email, companyId, ttlMs };
}

export function createPortalTrackingToken(input: {
  reference: string;
  email: string;
  companyId: string;
  ttlMs?: number;
}) {
  const normalized = normalizeTokenInput(input);
  const exp = Date.now() + normalized.ttlMs;
  const body = [
    normalized.reference,
    normalized.email,
    normalized.companyId,
    String(exp),
  ].join("|");
  const encodedBody = Buffer.from(body, "utf8").toString("base64url");
  const token = `${encodedBody}.${sign(body)}`;

  if (token.length > MAX_TOKEN_LENGTH) {
    throw new Error("Portal tracking token exceeds maximum length");
  }

  return token;
}

export function verifyPortalTrackingToken(token: string | null | undefined) {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedBody, signature] = parts;
  if (
    !encodedBody ||
    !signature ||
    !BASE64URL_PATTERN.test(encodedBody) ||
    !BASE64URL_PATTERN.test(signature)
  ) {
    return null;
  }

  const secret = trackingSecret();
  if (!secret) return null;

  let body: string;
  try {
    body = Buffer.from(encodedBody, "base64url").toString("utf8");
    if (Buffer.from(body, "utf8").toString("base64url") !== encodedBody) return null;
  } catch {
    return null;
  }

  const expected = sign(body);
  let suppliedSignature: Buffer;
  let expectedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(signature, "base64url");
    expectedSignature = Buffer.from(expected, "base64url");
  } catch {
    return null;
  }

  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }

  const fields = body.split("|");
  if (fields.length !== 4) return null;

  const [referenceRaw, emailRaw, companyIdRaw, expRaw] = fields;
  const reference = referenceRaw.trim().toUpperCase();
  const email = emailRaw.trim().toLowerCase();
  const companyId = companyIdRaw.trim();
  const exp = Number(expRaw);
  const now = Date.now();

  if (
    !reference ||
    reference.length > MAX_REFERENCE_LENGTH ||
    !EMAIL_PATTERN.test(email) ||
    email.length > MAX_EMAIL_LENGTH ||
    !companyId ||
    companyId.length > MAX_COMPANY_ID_LENGTH ||
    !Number.isSafeInteger(exp) ||
    exp <= now ||
    exp - now > MAX_TTL_MS
  ) {
    return null;
  }

  return { reference, email, companyId, exp };
}

export function extractPortalTrackingToken(request: Request, formData?: FormData | null) {
  const header = request.headers.get("x-portal-tracking-token")?.trim();
  if (header && header.length <= MAX_TOKEN_LENGTH) return header;

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token")?.trim();
  if (queryToken && queryToken.length <= MAX_TOKEN_LENGTH) return queryToken;

  if (formData) {
    const formToken = String(formData.get("token") || "").trim();
    if (formToken && formToken.length <= MAX_TOKEN_LENGTH) return formToken;
  }

  return null;
}
