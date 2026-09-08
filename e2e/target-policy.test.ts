import { describe, expect, it } from "vitest";
import { validateRelease, validateTarget } from "./target-policy.mjs";
const sha = "a".repeat(40);
const env = { E2E_BASE_URL: "https://revalta-candidate.vercel.app", E2E_EXPECTED_SHA: sha, E2E_PREVIEW_DATA_ISOLATED: "1", E2E_VERIFIED_EMAIL: "fixture@example.com", E2E_VERIFIED_PASSWORD: "fixture-only", E2E_VERIFIED_COMPANY_ID: "synthetic-company-a" };
describe("browser target safety and release evidence", () => {
  it("accepts a confirmed isolated exact Preview", () => { expect(validateTarget(env).isLocal).toBe(false); });
  it.each(["https://www.revalta.se", "https://attacker.test", "https://safe.vercel.app.attacker.test", "https://safe.vercel.app@attacker.test", "https://user:password@safe.vercel.app", "https://safe.vercel.app/path", "https://safe.vercel.app?x=1", "https://safe.vercel.app#x", "http://safe.vercel.app", "https://safe.vercel.app:444", "http://127.0.0.1:3000"])("rejects %s before any secret or network request", (url) => {
    expect(() => validateTarget({ ...env, E2E_BASE_URL: url })).toThrow();
  });
  it.each(["", "abc123", "a".repeat(39)])("requires a full candidate SHA (%s)", (sha) => { expect(() => validateTarget({ ...env, E2E_EXPECTED_SHA: sha })).toThrow(); });
  it.each(["E2E_PREVIEW_DATA_ISOLATED", "E2E_VERIFIED_EMAIL", "E2E_VERIFIED_PASSWORD", "E2E_VERIFIED_COMPANY_ID"])("blocks missing %s rather than skipping dashboard tests", (key) => { expect(() => validateTarget({ ...env, [key]: "" })).toThrow(/BLOCKED/); });
  const local = { E2E_BASE_URL: "http://127.0.0.1:3000", E2E_ALLOW_HTTP_LOCALHOST: "1", E2E_EXPECTED_SHA: sha, DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/revalta_e2e", DIRECT_URL: "postgresql://postgres:postgres@localhost:5432/revalta_e2e" };
  it("accepts a dedicated local fixture database", () => { expect(validateTarget(local).isLocal).toBe(true); });
  it.each(["postgresql://user:password@production.example/revalta_e2e", "postgresql://localhost/production", "postgresql://localhost/revalta_ci", ""])("blocks a non-fixture database", (url) => { expect(() => validateTarget({ ...local, DATABASE_URL: url })).toThrow(); });
  it("also checks DIRECT_URL", () => { expect(() => validateTarget({ ...local, DIRECT_URL: "postgresql://production.example/revalta_e2e" })).toThrow(); });
  const health = { status: "ok", database: "ok", release: { commitSha: sha, environment: "preview", deploymentId: "dpl_fixture" } };
  it("accepts the exact healthy Preview", () => { expect(() => validateRelease(health, validateTarget(env))).not.toThrow(); });
  it("requires the same deployment at the end of the browser flow", () => {
    expect(() => validateRelease(health, validateTarget(env), health)).not.toThrow();
    expect(() => validateRelease({ ...health, release: { ...health.release, deploymentId: "dpl_other" } }, validateTarget(env), health)).toThrow(/changed/);
  });
  it.each([{ commitSha: "b".repeat(40) }, { environment: "production" }, { deploymentId: null }])("rejects wrong release metadata", (change) => { expect(() => validateRelease({ ...health, release: { ...health.release, ...change } }, validateTarget(env))).toThrow(); });
  it.each([{ status: "degraded" }, { database: "error" }])("rejects an unhealthy target", (change) => { expect(() => validateRelease({ ...health, ...change }, validateTarget(env))).toThrow(); });
});
