function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || "";
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
