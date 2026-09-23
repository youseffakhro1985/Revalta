import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isPaginatedPropertiesRequest, sanitizePreviewFailure, validateEmptySearchResponse, validateFixtureProfile, validateLoginResponse, validateOwnerBillingPreviewDirectPlan, validateOwnerBillingPreviewInvalidPlan, validateOwnerBillingPreviewPlanChanged, validatePropertiesResponse } from "./verification-contract.mjs";

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

  it("requires owner billing to expose Preview-only direct plan changes", () => {
    expect(() => validateOwnerBillingPreviewDirectPlan(200, { canManage: true, canDirectChangePlan: true })).not.toThrow();
    expect(() => validateOwnerBillingPreviewDirectPlan(200, { canManage: true, canDirectChangePlan: false })).toThrow(
      /did not expose Preview-only direct plan changes/,
    );
    expect(() => validateOwnerBillingPreviewDirectPlan(403, { errorCode: "FORBIDDEN" })).toThrow(
      /did not expose Preview-only direct plan changes/,
    );
  });

  it("requires owner billing to apply an allowlisted Preview plan change", () => {
    expect(() => validateOwnerBillingPreviewPlanChanged(200, { success: true, company: { plan: "start" } }, "start")).not.toThrow();
    expect(() => validateOwnerBillingPreviewPlanChanged(200, { success: true, company: { plan: "professional" } }, "start")).toThrow(
      /did not apply the Preview-only direct plan change/,
    );
    expect(() => validateOwnerBillingPreviewPlanChanged(403, { errorCode: "FORBIDDEN" }, "start")).toThrow(
      /did not apply the Preview-only direct plan change/,
    );
  });

  it("requires owner billing to reject an invalid Preview plan change", () => {
    expect(() => validateOwnerBillingPreviewInvalidPlan(400, { errorCode: "VALIDATION_FAILED" })).not.toThrow();
    expect(() => validateOwnerBillingPreviewInvalidPlan(200, { success: true })).toThrow(
      /did not reject an invalid Preview plan change/,
    );
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

  it("runs owner billing Preview proof inside verified login without a workflow YAML change", () => {
    const runner = readFileSync(new URL("./auth-navigation.mjs", import.meta.url), "utf8");
    const workflow = readFileSync(new URL("../.github/workflows/e2e-preview.yml", import.meta.url), "utf8");
    expect(runner).toContain("validateOwnerBillingPreviewDirectPlan");
    expect(runner).toContain("validateOwnerBillingPreviewPlanChanged");
    expect(runner).toContain("validateOwnerBillingPreviewInvalidPlan");
    expect(runner).toContain("/api/billing");
    expect(runner).toContain("patchOwnerBillingPlan");
    expect(runner).toContain('patchOwnerBillingPlan("unlimited")');
    expect(workflow).toContain("node e2e/auth-navigation.mjs");
  });

  it("only treats the Fastigheter list contract as paginated property navigation", () => {
    expect(isPaginatedPropertiesRequest("https://revalta-candidate.vercel.app/api/properties?page=1&pageSize=10")).toBe(true);
    expect(isPaginatedPropertiesRequest("https://revalta-candidate.vercel.app/api/properties")).toBe(false);
    expect(isPaginatedPropertiesRequest("https://revalta-candidate.vercel.app/api/search?q=fastighet")).toBe(false);
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

describe("sanitizePreviewFailure", () => {
  it("keeps allowlisted diagnostics and drops unknown payload-bearing messages", () => {
    expect(sanitizePreviewFailure(new Error("Verified login response was not observed"))).toContain("Verified login");
    expect(sanitizePreviewFailure(new Error("BLOCKED: release identity changed or became unverifiable"))).toContain("release identity");
    expect(sanitizePreviewFailure(new Error("BLOCKED: Preview schema is not ready for this release"))).toContain("schema is not ready");
    expect(sanitizePreviewFailure(new Error("BLOCKED: Preview data-plane isolation is not ready for this release"))).toContain("data-plane isolation");
    expect(sanitizePreviewFailure(new Error("Work-order edit lock was not acquired (423)"))).toContain("edit lock");
    expect(sanitizePreviewFailure(new Error("Time entry create did not persist as submitted (503:SERVICE_UNAVAILABLE)"))).toContain("503:SERVICE_UNAVAILABLE");
    expect(sanitizePreviewFailure(new Error("register POST did not produce a response (network failure: net::ERR_ABORTED)"))).toContain("did not produce a response");
    expect(sanitizePreviewFailure(new Error("register mutation was blocked by release identity verification"))).toContain("release identity");
    expect(sanitizePreviewFailure(new Error("timeout at https://secret.example/login?token=abc user@example.com"))).toBe(
      "Preview verification failed; no release approval. Check target, fixtures and required browser steps.",
    );
  });

  it("maps Playwright timeouts without leaking locators", () => {
    expect(sanitizePreviewFailure(new Error('Timeout 20000ms exceeded while waiting for event "response"'))).toBe(
      "A required browser event timed out",
    );
  });
});
