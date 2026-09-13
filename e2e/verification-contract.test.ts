import { describe, expect, it } from "vitest";
import { validateEmptySearchResponse, validateFixtureProfile, validateLoginResponse, validatePropertiesResponse } from "./verification-contract.mjs";

const fixture = { email: "fixture@example.com", companyId: "synthetic-company-a" };
const user = {
  email: fixture.email, role: "owner", status: "active",
  email_verified_at: "2026-09-08T00:00:00.000Z", company_id: fixture.companyId,
  company: { id: fixture.companyId, status: "active" },
};

describe("authenticated Preview evidence", () => {
  it("requires the authenticated account to match the expected fixture", () => {
    expect(() => validateLoginResponse(200, { success: true, user }, fixture.email)).not.toThrow();
    expect(() => validateLoginResponse(200, { success: true, user: { email: "other@example.com" } }, fixture.email)).toThrow();
    expect(() => validateLoginResponse(401, { success: true, user }, fixture.email)).toThrow();
    expect(() => validateLoginResponse(200, { user }, fixture.email)).toThrow();
  });

  it("accepts a verified active owner with the exact company relation", () => {
    expect(() => validateFixtureProfile(200, { user }, fixture)).not.toThrow();
  });

  it.each([
    { company_id: "company-b" }, { company: { id: "company-b", status: "active" } },
    { company_id: null }, { company: null }, { company: { id: fixture.companyId, status: "suspended" } },
    { email_verified_at: null }, { email_verified_at: "invalid" },
    { role: "resident" }, { role: "unknown" }, { status: "inactive" }, { email: "other@example.com" },
  ])("rejects an unverified, inactive or wrongly scoped account: %j", (change) => {
    expect(() => validateFixtureProfile(200, { user: { ...user, ...change } }, fixture)).toThrow();
  });

  it("does not accept a missing expected company or an unsuccessful profile response", () => {
    expect(() => validateFixtureProfile(200, { user }, { ...fixture, companyId: "" })).toThrow();
    expect(() => validateFixtureProfile(401, { user }, fixture)).toThrow();
  });

  it("accepts a real empty property list but rejects error fallbacks and malformed pagination", () => {
    const body = { properties: [], pagination: { total: 0 } };
    expect(() => validatePropertiesResponse(200, body)).not.toThrow();
    expect(() => validatePropertiesResponse(503, body)).toThrow();
    expect(() => validatePropertiesResponse(200, {})).toThrow();
    expect(() => validatePropertiesResponse(200, { ...body, pagination: { total: -1 } })).toThrow();
    expect(() => validatePropertiesResponse(200, { properties: [{ id: "synthetic" }], pagination: { total: 0 } })).toThrow();
  });

  it("never counts an API failure or malformed body as a successful empty search", () => {
    expect(() => validateEmptySearchResponse(200, { results: [] })).not.toThrow();
    for (const status of [401, 403, 429, 500]) {
      expect(() => validateEmptySearchResponse(status, { results: [] })).toThrow();
    }
    expect(() => validateEmptySearchResponse(200, {})).toThrow();
    expect(() => validateEmptySearchResponse(200, { results: [{ id: "unexpected" }] })).toThrow();
  });

  it("does not echo response content or fixture credentials in diagnostic errors", () => {
    const sensitive = "sensitive-fixture-value";
    try {
      validateFixtureProfile(200, { user: { email: sensitive, password: sensitive } }, { email: sensitive, companyId: sensitive });
      throw new Error("validator unexpectedly passed");
    } catch (error) {
      expect(String(error)).toContain("Fixture must be");
      expect(String(error)).not.toContain(sensitive);
    }
  });
});
