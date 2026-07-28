import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCanonicalReleasePolicy,
  calculateReleasePolicyDigest,
  calculateSha256,
  parseChecksumFile,
  validateAttestationFreshness,
  validateBoundaryOutcome,
  validateBoundaryRequest,
  validateBoundaryTransport,
  validateReleaseAttestation,
  validateReleasePolicyEvidence,
  validateReleaseProvenance,
  verifyReleaseAttestationFiles,
} from "./verify-release-attestation.mjs";

const SHA = "9d3ce1f5530a55e9e817c85933f2683dab69bb77";
const NOW = new Date("2026-07-28T00:05:00.000Z");
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
const policyEvidence = { id: "revalta.strict-release-policy.v1", sha256: calculateReleasePolicyDigest() };

function attestation(overrides = {}) {
  return {
    schemaVersion: 5,
    kind: "revalta.release-boundary-attestation",
    verdict: "passed",
    checkedAt: "2026-07-28T00:00:00.000Z",
    policy: policyEvidence,
    release: {
      commitSha: SHA,
      shortCommitSha: SHA.slice(0, 7),
      environment: "preview",
      branch: "release-preview",
      origin: "https://revalta-release-preview.vercel.app",
    },
    provenance,
    boundaries: [
      { name: "public-home", request: { method: "GET", path: "/" }, httpStatus: 200, durationMs: 10, redirectLocation: null, transport: clean },
      { name: "dashboard-boundary", request: { method: "GET", path: "/dashboard" }, httpStatus: 307, durationMs: 1_508, redirectLocation: "/login", transport: { attempts: 2, retryStatuses: [503], networkErrors: 0, totalBackoffMs: 1_500 } },
      { name: "health-api", request: { method: "GET", path: "/api/health" }, httpStatus: 200, durationMs: 1_512, redirectLocation: null, transport: { attempts: 2, retryStatuses: [], networkErrors: 1, totalBackoffMs: 1_500 } },
    ],
    ...overrides,
  };
}

describe("release attestation verifier", () => {
  it("parses the standard checksum format", () => {
    const hash = "a".repeat(64);
    expect(parseChecksumFile(`${hash}  release.json\n`, "release.json")).toBe(hash);
    expect(() => parseChecksumFile(`${hash} release.json`, "release.json")).toThrow("format");
  });

  it("validates schema v5, policy, identity, provenance and endpoints", () => {
    const result = validateReleaseAttestation(attestation(), {
      commitSha: SHA,
      environment: "preview",
      branch: "release-preview",
      origin: "https://revalta-release-preview.vercel.app",
      provenance: { runId: provenance.runId, runAttempt: 1 },
    }, { now: NOW });
    expect(result.policy).toEqual(policyEvidence);
    expect(() => validateReleaseAttestation(attestation({ schemaVersion: 4 }), {}, { now: NOW })).toThrow("schemaVersion");
    expect(() => validateReleaseAttestation(attestation({ boundaries: [] }), {}, { now: NOW })).toThrow("exactly");
  });

  it("rejects forged or ambiguous policy evidence", () => {
    expect(() => validateReleasePolicyEvidence({ id: "other-policy", sha256: policyEvidence.sha256 })).toThrow("policy id");
    expect(() => validateReleasePolicyEvidence({ id: policyEvidence.id, sha256: "0".repeat(64) })).toThrow("policy SHA-256 mismatch");
    expect(() => validateReleasePolicyEvidence({ ...policyEvidence, algorithm: "sha256" })).toThrow("only id and sha256");
    expect(() => validateReleasePolicyEvidence(null)).toThrow("policy evidence is required");
    const modified = buildCanonicalReleasePolicy();
    modified.retryableHttpStatuses = [500];
    expect(calculateReleasePolicyDigest(modified)).not.toBe(policyEvidence.sha256);
  });

  it("rejects forged endpoint identity and non-canonical request evidence", () => {
    expect(() => validateBoundaryRequest({ method: "POST", path: "/" }, "public-home")).toThrow("method must be GET");
    expect(() => validateBoundaryRequest({ method: "GET", path: "/admin" }, "dashboard-boundary")).toThrow("path must be /dashboard");
    expect(() => validateBoundaryRequest({ method: "GET", path: "/api/health?full=1" }, "health-api")).toThrow("path must be /api/health");
    expect(() => validateBoundaryRequest({ method: "GET", path: "/", headers: {} }, "public-home")).toThrow("only method and path");
  });

  it("rejects forged provenance, retry evidence and outcome confusion", () => {
    expect(() => validateReleaseProvenance({ ...provenance, repository: "other/Revalta" })).toThrow("repository must be");
    expect(() => validateBoundaryTransport({ attempts: 2, retryStatuses: [404], networkErrors: 0, totalBackoffMs: 1 }, "home")).toThrow("non-retryable");
    expect(() => validateBoundaryOutcome({ name: "public-home", httpStatus: 302, redirectLocation: "/login" })).toThrow("HTTP 200");
    expect(() => validateBoundaryOutcome({ name: "dashboard-boundary", httpStatus: 307, redirectLocation: "https://evil.example/login" })).toThrow("canonical /login");
  });

  it("rejects duration evidence shorter than recorded backoff", () => {
    const impossible = attestation();
    impossible.boundaries[1] = { ...impossible.boundaries[1], durationMs: 1_499 };
    expect(() => validateReleaseAttestation(impossible, {}, { now: NOW })).toThrow("durationMs cannot be shorter than totalBackoffMs");
  });

  it("enforces canonical timestamps and replay limits", () => {
    expect(validateAttestationFreshness("2026-07-28T00:00:00.000Z", { now: NOW, maxAgeSeconds: 300 }).ageMs).toBe(300_000);
    expect(() => validateAttestationFreshness("2026-07-28T00:00:00Z", { now: NOW })).toThrow("canonical UTC");
    expect(() => validateAttestationFreshness("2026-07-27T23:59:59.999Z", { now: NOW, maxAgeSeconds: 300 })).toThrow("older than 300 seconds");
  });

  it("verifies files and detects byte manipulation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "revalta-attestation-verify-"));
    const jsonPath = join(directory, "release.json");
    const checksumPath = `${jsonPath}.sha256`;
    const bytes = Buffer.from(`${JSON.stringify(attestation(), null, 2)}\n`, "utf8");
    const hash = calculateSha256(bytes);
    await writeFile(jsonPath, bytes);
    await writeFile(checksumPath, `${hash}  release.json\n`);
    const verified = await verifyReleaseAttestationFiles({ attestationPath: jsonPath, checksumPath, now: NOW, maxAgeSeconds: 300 });
    expect(verified.checksum).toBe(hash);
    expect(verified.policy).toEqual(policyEvidence);
    await writeFile(jsonPath, Buffer.concat([bytes, Buffer.from(" ")]));
    await expect(verifyReleaseAttestationFiles({ attestationPath: jsonPath, checksumPath, now: NOW })).rejects.toThrow("checksum mismatch");
    expect(await readFile(checksumPath, "utf8")).toContain(hash);
  });
});