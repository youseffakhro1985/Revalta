const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export { REQUEST_ID_HEADER };

export function resolveRequestId(headers: Headers, generate: () => string = () => crypto.randomUUID()) {
  const candidate = headers.get(REQUEST_ID_HEADER)?.trim();
  if (candidate && REQUEST_ID_PATTERN.test(candidate)) {
    return candidate.toLowerCase();
  }

  return generate().toLowerCase();
}

export function withRequestCorrelation(response: Response, requestId: string) {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export function correlatedRequestHeaders(headers: Headers, requestId: string) {
  const correlated = new Headers(headers);
  correlated.set(REQUEST_ID_HEADER, requestId);
  return correlated;
}
