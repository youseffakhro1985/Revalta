function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || "";
}

const JSON_BODY_LIMIT_BYTES = 1_000_000;
const MULTIPART_BODY_LIMIT_BYTES = 20 * 1024 * 1024;
const DEFAULT_BODY_LIMIT_BYTES = 2_000_000;

export function requestBodyLimitBytes(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (contentType.startsWith("multipart/form-data")) return MULTIPART_BODY_LIMIT_BYTES;
  if (contentType.includes("application/json")) return JSON_BODY_LIMIT_BYTES;
  return DEFAULT_BODY_LIMIT_BYTES;
}

/**
 * Reject declared oversized payloads before route handlers buffer JSON or files.
 * The platform remains the final guard for chunked requests without Content-Length.
 */
export function isDeclaredRequestBodyTooLarge(request: Request) {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return false;
  if (!/^\d+$/.test(rawLength)) return true;

  const length = Number(rawLength);
  return !Number.isSafeInteger(length) || length < 0 || length > requestBodyLimitBytes(request);
}

export function isTrustedMutationRequest(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const expectedHost =
      firstHeaderValue(request.headers.get("x-forwarded-host")) ||
      firstHeaderValue(request.headers.get("host")) ||
      requestUrl.host;
    const expectedProtocol =
      firstHeaderValue(request.headers.get("x-forwarded-proto")) || requestUrl.protocol.replace(":", "");

    return originUrl.host === expectedHost && originUrl.protocol === `${expectedProtocol}:`;
  } catch {
    return false;
  }
}
