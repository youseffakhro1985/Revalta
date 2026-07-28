import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildReleaseAttestation,
  calculateReleaseAttestationChecksum,
  normalizeBoundaryOutcome,
  serializeReleaseAttestation,
  validateReleaseProvenance,
  writeReleaseAttestation,
} from "./run-strict-release-gate.mjs";

const SHA = "3faf049f8ba51b577824d53a18fff71ac6a34420";
const target = { baseUrl: "https://revalta-release-preview.vercel.app", expectedSha: SHA, environment: "preview", branch: "release-preview" };
const provenance = {
  repository: "youseffakhro1985/Revalta",
  workflow: "Strict Release Boundary Gate",
  workflowRef: "youseffakhro1985/Revalta/.github/workflows/strict-release-boundary-gate.yml@refs/heads/release-preview",
  runId: "30320000000",
  runAttempt: 1,
  serverUrl: "https://github.com",
  runUrl: "https://github.com/youseffakhro1985/Revalta/actions/runs/30320000000",
};
const clean = { attempts: 1, retryStatuses: [], networkErrors: 0, totalBackoffMs: 0 };

function report(overrides = {}) {
  return {
    baseUrl: target.baseUrl,
    release: SHA,
    environment: "preview",
    branch: "release-preview",
    results: [
      { label: "public-home", status: 200, durationMs: 12, location: null, ...clean },
      { label: "dashboard-boundary", status: 307, durationMs: 1508, location: "/login", attempts: 2, retryStatuses: [503], networkErrors: 0, totalBackoffMs: 1500 },
      { label: "health-api", status: 200, durationMs: 1516, location: null, attempts: 2, retryStatuses: [], networkErrors: 1, totalBackoffMs: 1500 },
    ],
    ...overrides,
  };
}

function attestation() {
  return buildReleaseAttestation({ target, report: report(), provenance, checkedAt: new Date("2026-07-28T00:00:00.000Z") });
}

describe("strict release attestation", () => {
  it("creates schema-v3 secret-free evidence with canonical outcomes and retry telemetry", () => {
    const evidence = attestation();
    expect(evidence.schemaVersion).toBe(3);
    expect(evidence.provenance).toEqual(provenance);
    expect(evidence.boundaries.map((boundary) => [boundary.name, boundary.httpStatus, boundary.redirectLocation])).toEqual([
      ["public-home", 200, null],
      ["dashboard-boundary", 307, "/login"],
      ["health-api", 200, null],
    ]);
    expect(evidence.boundaries[0].transport).toEqual(clean);
    expect(evidence.boundaries[1].transport).toEqual({ attempts: 2, retryStatuses: [503], networkErrors: 0, totalBackoffMs: 1500 });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("cookie");
    expect(serialized).not.toContain("token");
  });

  it("canonicalizes same-origin dashboard redirects and rejects unsafe destinations", () => {
    const base = { label: "dashboard-boundary", status: 307, durationMs: 5, attempts: 1, retryStatuses: [], networkErrors: 0, totalBackoffMs: 0 };
    expect(normalizeBoundaryOutcome({ ...base, location: `${target.baseUrl}/login` }, target.baseUrl).redirectLocation).toBe("/login");
    expect(() => normalizeBoundaryOutcome({ ...base, location: "https://evil.example/login" }, target.baseUrl)).toThrow("escaped release origin");
    expect(() => normalizeBoundaryOutcome({ ...base, location: "/login?next=/dashboard" }, target.baseUrl)).toThrow("query string");
    expect(() => normalizeBoundaryOutcome({ ...base, location: "/login#continue" }, target.baseUrl)).toThrow("fragment");
  });

  it("rejects boundary-specific status confusion", () => {
    const home = { label: "public-home", status: 302, durationMs: 1, location: "/login", ...clean };
    const health = { label: "health-api", status: 404, durationMs: 1, location: null, ...clean };
    const publicDashboard = { label: "dashboard-boundary", status: 200, durationMs: 1, location: null, ...clean };
    const denialWithLocation = { label: "dashboard-boundary", status: 401, durationMs: 1, location: "/login", ...clean };
    expect(() => normalizeBoundaryOutcome(home, target.baseUrl)).toThrow("public-home");
    expect(() => normalizeBoundaryOutcome(health, target.baseUrl)).toThrow("health-api");
    expect(() => normalizeBoundaryOutcome(publicDashboard, target.baseUrl)).toThrow("requires redirect");
    expect(() => normalizeBoundaryOutcome(denialWithLocation, target.baseUrl)).toThrow("must not include");
  });

  it("rejects invalid provenance and inconsistent transport evidence", () => {
    expect(() => validateReleaseProvenance({ ...provenance, repository: "invalid" })).toThrow("owner/name");
    expect(() => validateReleaseProvenance({ ...provenance, runUrl: "https://github.com/other/run" })).toThrow("runUrl mismatch");
    const invalid = report();
    invalid.results[0] = { ...invalid.results[0], attempts: 2 };
    expect(() => buildReleaseAttestation({ target, provenance, report: invalid })).toThrow("retry evidence count mismatch");
  });

  it("rejects evidence assembled from a different release or boundary set", () => {
    expect(() => buildReleaseAttestation({ target, provenance, report: report({ release: "1".repeat(40) }) })).toThrow("SHA mismatch");
    expect(() => buildReleaseAttestation({ target, provenance, report: report({ environment: "production" }) })).toThrow("environment mismatch");
    expect(() => buildReleaseAttestation({ target, provenance, report: report({ results: report().results.slice(0, 2) }) })).toThrow("boundaries must be exactly");
  });

  it("serializes deterministically and detects byte-level changes", () => {
    const serialized = serializeReleaseAttestation(attestation());
    expect(serialized.endsWith("\n")).toBe(true);
    expect(serializeReleaseAttestation(attestation())).toBe(serialized);
    const checksum = calculateReleaseAttestationChecksum(serialized);
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(calculateReleaseAttestationChecksum(serialized.replace("passed", "failed"))).not.toBe(checksum);
  });

  it("writes JSON and checksum atomically with private permissions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "revalta-release-attestation-"));
    const path = join(directory, "nested", "attestation.json");
    const evidence = attestation();
    const serialized = serializeReleaseAttestation(evidence);
    const expectedChecksum = calculateReleaseAttestationChecksum(serialized);
    const written = await writeReleaseAttestation(path, evidence);
    expect(written.checksum).toBe(expectedChecksum);
    expect(await readFile(path, "utf8")).toBe(serialized);
    expect(await readFile(`${path}.sha256`, "utf8")).toBe(`${expectedChecksum}  attestation.json\n`);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(`${path}.sha256`)).mode & 0o777).toBe(0o600);
  });
});