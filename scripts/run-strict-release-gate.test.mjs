import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCanonicalReleasePolicy,
  buildReleaseAttestation,
  buildReleasePolicyEvidence,
  calculateReleaseAttestationChecksum,
  calculateReleasePolicyDigest,
  normalizeBoundaryOutcome,
  serializeReleaseAttestation,
  validateCanonicalAttestationShape,
  validateReleaseProvenance,
  writeReleaseAttestation,
} from "./run-strict-release-gate.mjs";

const SHA = "3faf049f8ba51b577824d53a18fff71ac6a34420";
const target = { baseUrl: "https://revalta-release-preview.vercel.app", expectedSha: SHA, environment: "preview", branch: "release-preview" };
const provenance = { repository: "youseffakhro1985/Revalta", workflow: "Strict Release Boundary Gate", workflowRef: "youseffakhro1985/Revalta/.github/workflows/strict-release-boundary-gate.yml@refs/heads/release-preview", runId: "30320000000", runAttempt: 1, serverUrl: "https://github.com", runUrl: "https://github.com/youseffakhro1985/Revalta/actions/runs/30320000000" };
const clean = { attempts: 1, retryStatuses: [], networkErrors: 0, totalBackoffMs: 0 };

function report(overrides = {}) {
  return { baseUrl: target.baseUrl, release: SHA, environment: "preview", branch: "release-preview", results: [
    { label: "public-home", status: 200, durationMs: 12, location: null, ...clean },
    { label: "dashboard-boundary", status: 307, durationMs: 1508, location: "/login", attempts: 2, retryStatuses: [503], networkErrors: 0, totalBackoffMs: 1500 },
    { label: "health-api", status: 200, durationMs: 1516, location: null, attempts: 2, retryStatuses: [], networkErrors: 1, totalBackoffMs: 1500 },
  ], ...overrides };
}
function attestation() { return buildReleaseAttestation({ target, report: report(), provenance, checkedAt: new Date("2026-07-28T00:00:00.000Z") }); }

describe("strict release attestation", () => {
  it("creates schema-v6 evidence bound to exact endpoints, policy and object shapes", () => {
    const evidence = attestation();
    expect(evidence.schemaVersion).toBe(6);
    expect(evidence.policy).toEqual(buildReleasePolicyEvidence());
    expect(evidence.provenance).toEqual(provenance);
    expect(evidence.boundaries.map((boundary) => [boundary.name, boundary.request.method, boundary.request.path])).toEqual([
      ["public-home", "GET", "/"], ["dashboard-boundary", "GET", "/dashboard"], ["health-api", "GET", "/api/health"],
    ]);
    expect(() => validateCanonicalAttestationShape(evidence)).not.toThrow();
  });

  it("calculates a deterministic policy fingerprint sensitive to shape-contract changes", () => {
    const policy = buildCanonicalReleasePolicy();
    const digest = calculateReleasePolicyDigest(policy);
    expect(digest).toBe(calculateReleasePolicyDigest(buildCanonicalReleasePolicy()));
    expect(policy.objectShapeContract).toBe("exact-keys-no-extensions");
    expect(calculateReleasePolicyDigest({ ...policy, objectShapeContract: "allow-extensions" })).not.toBe(digest);
  });

  it("rejects unknown fields before serialization", () => {
    const top = { ...attestation(), debug: true };
    expect(() => serializeReleaseAttestation(top)).toThrow("Release attestation must contain exactly");
    const release = attestation(); release.release = { ...release.release, deploymentId: "dep_1" };
    expect(() => serializeReleaseAttestation(release)).toThrow("Release metadata must contain exactly");
    const boundary = attestation(); boundary.boundaries[0] = { ...boundary.boundaries[0], body: "ok" };
    expect(() => serializeReleaseAttestation(boundary)).toThrow("public-home evidence must contain exactly");
    const transport = attestation(); transport.boundaries[0].transport = { ...transport.boundaries[0].transport, lastError: null };
    expect(() => serializeReleaseAttestation(transport)).toThrow("public-home transport evidence must contain exactly");
  });

  it("canonicalizes redirects and rejects unsafe outcomes", () => {
    const base = { label: "dashboard-boundary", status: 307, durationMs: 5, attempts: 1, retryStatuses: [], networkErrors: 0, totalBackoffMs: 0 };
    expect(normalizeBoundaryOutcome({ ...base, location: `${target.baseUrl}/login` }, target.baseUrl).redirectLocation).toBe("/login");
    expect(() => normalizeBoundaryOutcome({ ...base, location: "https://evil.example/login" }, target.baseUrl)).toThrow("escaped release origin");
    expect(() => normalizeBoundaryOutcome({ label: "health-api", status: 404, durationMs: 1, location: null, ...clean }, target.baseUrl)).toThrow("health-api");
  });

  it("rejects invalid provenance, transport and release identity", () => {
    expect(() => validateReleaseProvenance({ ...provenance, repository: "invalid" })).toThrow("owner/name");
    expect(() => validateReleaseProvenance({ ...provenance, actor: "attacker" })).toThrow("Release provenance must contain exactly");
    const invalid = report(); invalid.results[0] = { ...invalid.results[0], attempts: 2 };
    expect(() => buildReleaseAttestation({ target, provenance, report: invalid })).toThrow("retry evidence count mismatch");
    expect(() => buildReleaseAttestation({ target, provenance, report: report({ release: "1".repeat(40) }) })).toThrow("SHA mismatch");
  });

  it("serializes deterministically and writes private checksum-backed files", async () => {
    const serialized = serializeReleaseAttestation(attestation());
    expect(serialized.endsWith("\n")).toBe(true);
    expect(serializeReleaseAttestation(attestation())).toBe(serialized);
    const checksum = calculateReleaseAttestationChecksum(serialized);
    const directory = await mkdtemp(join(tmpdir(), "revalta-release-attestation-"));
    const path = join(directory, "nested", "attestation.json");
    const written = await writeReleaseAttestation(path, attestation());
    expect(written.checksum).toBe(checksum);
    expect(await readFile(path, "utf8")).toBe(serialized);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(`${path}.sha256`)).mode & 0o777).toBe(0o600);
  });
});