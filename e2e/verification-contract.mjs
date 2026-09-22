// Only fixed diagnostic messages leave these validators. Never include response
// bodies, credentials, cookies or user/company details in CI output.
export function validateLoginResponse(status, body, email) {
  if (status !== 200 || body?.success !== true || body?.user?.email !== email) {
    throw new Error("Verified fixture login did not succeed");
  }
}

export function validateFixtureProfile(status, body, { email, companyId }) {
  const user = body?.user;
  if (
    status !== 200
    || !companyId
    || user?.email !== email
    || user?.role !== "owner"
    || user?.status !== "active"
    || typeof user?.email_verified_at !== "string"
    || !Number.isFinite(Date.parse(user.email_verified_at))
    || user?.company_id !== companyId
    || user?.company?.id !== companyId
    || user?.company?.status !== "active"
  ) {
    throw new Error("Fixture must be a verified active owner in the expected test company");
  }
}

export function isPaginatedPropertiesRequest(url) {
  try {
    const parsed = new URL(url, "https://e2e.invalid");
    return parsed.pathname === "/api/properties" && parsed.searchParams.has("page");
  } catch {
    return false;
  }
}

export function validatePropertiesResponse(status, body) {
  if (
    status !== 200
    || !Array.isArray(body?.properties)
    || !Number.isSafeInteger(body?.pagination?.total)
    || body.pagination.total < body.properties.length
  ) {
    throw new Error("Property navigation did not load a valid paginated API response");
  }
}

export function validateEmptySearchResponse(status, body) {
  if (status !== 200 || !Array.isArray(body?.results) || body.results.length !== 0) {
    throw new Error("Command Center empty state requires a successful empty search response");
  }
}

const SAFE_FAILURE = /did not |was not |not visible|not persist|lifecycle|illegal |audit history|readable after|Fixture |Unknown browser|skipped|lock was not|HTTP \d+|release identity|Cross-origin|Verified login|Verified fixture|Property navigation|Command Center|Work-order |Ticket |Time entry |Material |Invoice |Staff ticket|A required browser/;

export function sanitizePreviewFailure(error) {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("BLOCKED")) return message.slice(0, 300);
  if (SAFE_FAILURE.test(message)) {
    return message.replace(/https?:\/\/\S+/gi, "[url]").replace(/\S+@\S+/g, "[email]").slice(0, 300);
  }
  if (/Timeout .*exceeded/i.test(message) || /exceeded .*timeout/i.test(message)) {
    return "A required browser event timed out";
  }
  return "Preview verification failed; no release approval. Check target, fixtures and required browser steps.";
}
