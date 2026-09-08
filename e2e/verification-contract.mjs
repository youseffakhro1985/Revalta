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
