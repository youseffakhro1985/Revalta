const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export { REQUEST_ID_HEADER };

export function normalizeRequestId(
  candidate: string | null | undefined,
  generate: () => string = () => crypto.randomUUID(),
) {
  const normalized = candidate?.trim();
  if (normalized && REQUEST_ID_PATTERN.test(normalized)) {
    return normalized.toLowerCase();
  }

  const generated = generate().trim();
  if (!REQUEST_ID_PATTERN.test(generated)) {
    throw new Error("Request ID generator returned an invalid UUID");
  }

  return generated.toLowerCase();
}

export function resolveRequestId(headers: Headers, generate?: () => string) {
  return normalizeRequestId(headers.get(REQUEST_ID_HEADER), generate);
}

export function withRequestCorrelation(response: Response, requestId: string) {
  response.headers.set(REQUEST_ID_HEADER, normalizeRequestId(requestId));
  return response;
}

export function correlatedRequestHeaders(headers: Headers, requestId: string) {
  const correlated = new Headers(headers);
  correlated.set(REQUEST_ID_HEADER, normalizeRequestId(requestId));
  return correlated;
}
