import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCanonicalReleasePolicy,
  calculateReleasePolicyDigest,
  calculateSha256,
  parseCanonicalChecksumBytes,
  parseChecksumFile,
  validateAttestationFreshness,
  validateBoundaryOutcome,
  validateBoundaryRequest,
  validateBoundaryTransport,
  validateCanonicalAttestationShape,
  validateReleaseAttestation,
  validateReleasePolicyEvidence,
  validateReleaseProvenance,
  verifyReleaseAttestationFiles,
  verifyReleaseAttestationSnapshot,
} from "./verify-release-attestation.mjs";

const SHA = "9d3ce1f5530a55e9e817c85933f2683dab69bb77";
const NOW = new Date("2026-07-28T00:05:00.000Z");
const provenance = { repository: "youseffakhro1985/Revalta", workflow: "Strict Release Boundary Gate", workflowRef: "youseffakhro1985/Revalta/.github/workflows/strict-release-boundary-gate.yml@refs/heads/release-preview", runId: "30320000000", runAttempt: 1, serverUrl: "https://github.com", runUrl: "https://github.com/youseffakhro1985/Revalta/actions/runs/30320000000" };
const clean = { attempts: 1, retryStatuses: [], networkErrors: 0, totalBackoffMs: 0 };
const policyEvidence = { id: "revalta.strict-release-policy.v1", sha256: calculateReleasePolicyDigest() };

function attestation(overrides = {}) {
  return {
    schemaVersion: 6,
    kind: "revalta.release-boundary-attestation",
    verdict: "passed",
    checkedAt: "2026-07-28T00:00:00.000Z",
    policy: policyEvidence,
    release: { commitSha: SHA, shortCommitSha: SHA.slice(0, 7), environment: "preview", branch: "release-preview", origin: "https://revalta-release-preview.vercel.app" },
    provenance,
    boundaries: [
      { name: "public-home", request: { method: "GET", path: "/" }, httpStatus: 200, durationMs: 10, redirectLocation: null, transport: clean },
      { name: "dashboard-boundary", request: { method: "GET", path: "/dashboard" }, httpStatus: 307, durationMs: 1508, redirectLocation: "/login", transport: { attempts: 2, retryStatuses: [503], networkErrors: 0, totalBackoffMs: 1500 } },
      { name: "health-api", request: { method: "GET", path: "/api/health" }, httpStatus: 200, durationMs: 1512, redirectLocation: null, transport: { attempts: 2, retryStatuses: [], networkErrors: 1, totalBackoffMs: 1500 } },
    ],
    ...overrides,
  };
}

function evidenceBytes() {
  return Buffer.from(`${JSON.stringify(attestation(), null, 2)}\n`, "utf8");
}

function checksumBytes(bytes = evidenceBytes(), filename = "release.json") {
  return Buffer.from(`${calculateSha256(bytes)}  ${filename}\n`, "utf8");
}

describe("release attestation verifier", () => {
  it("parses checksum files and validates schema v6", () => {
    const hash = "a".repeat(64);
    expect(parseChecksumFile(`${hash}  release.json\n`, "release.json")).toBe(hash);
    const result = validateReleaseAttestation(attestation(), { commitSha: SHA, environment: "preview", branch: "release-preview", origin: "https://revalta-release-preview.vercel.app", provenance: { runId: provenance.runId, runAttempt: 1 } }, { now: NOW });
    expect(result.policy).toEqual(policyEvidence);
    expect(() => validateReleaseAttestation(attestation({ schemaVersion: 5 }), {}, { now: NOW })).toThrow("schemaVersion");
  });

  it("requires a canonical lowercase checksum sidecar", () => {
    const bytes = evidenceBytes();
    const hash = calculateSha256(bytes);
    expect(parseCanonicalChecksumBytes(Buffer.from(`${hash}  release.json\n`), "release.json")).toBe(hash);
    expect(() => parseCanonicalChecksumBytes(Buffer.from(`${hash.toUpperCase()}  release.json\n`), "release.json")).toThrow("canonical lowercase");
    expect(() => parseCanonicalChecksumBytes(Buffer.from(`${hash}  release.json\r\n`), "release.json")).toThrow("canonical lowercase");
    expect(() => parseCanonicalChecksumBytes(Buffer.from(`${hash}  release.json\n\n`), "release.json")).toThrow("canonical lowercase");
    expect(() => parseCanonicalChecksumBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), checksumBytes(bytes)]), "release.json")).toThrow("UTF-8 BOM");
    expect(() => parseCanonicalChecksumBytes(checksumBytes(bytes, "other.json"), "release.json")).toThrow("filename mismatch");
    expect(() => parseCanonicalChecksumBytes(checksumBytes(bytes), "release.json", { maxBytes: 8 })).toThrow("exceeds 8 byte");
  });

  it("verifies checksum and semantics from one immutable snapshot", () => {
    const bytes = evidenceBytes();
    const verified = verifyReleaseAttestationSnapshot({
      attestationBytes: bytes,
      checksumBytes: checksumBytes(bytes),
      expectedFilename: "release.json",
      now: NOW,
      maxAgeSeconds: 300,
    });
    expect(verified.checksum).toBe(calculateSha256(bytes));
    const changed = Buffer.from(bytes);
    changed[changed.length - 2] = 0x20;
    expect(() => verifyReleaseAttestationSnapshot({ attestationBytes: changed, checksumBytes: checksumBytes(bytes), expectedFilename: "release.json", now: NOW })).toThrow("checksum mismatch");
  });

  it("rejects unknown fields at every critical evidence level", () => {
    expect(() => validateCanonicalAttestationShape({ ...attestation(), debug: true })).toThrow("Release attestation must contain exactly");
    const release = attestation(); release.release = { ...release.release, deploymentId: "dep_1" };
    expect(() => validateReleaseAttestation(release, {}, { now: NOW })).toThrow("Release metadata must contain exactly");
    const prov = attestation(); prov.provenance = { ...prov.provenance, actor: "attacker" };
    expect(() => validateReleaseAttestation(prov, {}, { now: NOW })).toThrow("Release provenance must contain exactly");
    const boundary = attestation(); boundary.boundaries[0] = { ...boundary.boundaries[0], responseBody: "ok" };
    expect(() => validateReleaseAttestation(boundary, {}, { now: NOW })).toThrow("public-home evidence must contain exactly");
    const transport = attestation(); transport.boundaries[0].transport = { ...transport.boundaries[0].transport, lastError: null };
    expect(() => validateReleaseAttestation(transport, {}, { now: NOW })).toThrow("public-home transport evidence must contain exactly");
  });

  it("rejects forged policy, endpoint, provenance and transport evidence", () => {
    expect(() => validateReleasePolicyEvidence({ id: "other-policy", sha256: policyEvidence.sha256 })).toThrow("policy id");
    expect(() => validateReleasePolicyEvidence({ ...policyEvidence, algorithm: "sha256" })).toThrow("must contain exactly");
    const modified = buildCanonicalReleasePolicy(); modified.retryableHttpStatuses = [500];
    expect(calculateReleasePolicyDigest(modified)).not.toBe(policyEvidence.sha256);
    expect(() => validateBoundaryRequest({ method: "POST", path: "/" }, "public-home")).toThrow("method must be GET");
    expect(() => validateReleaseProvenance({ ...provenance, repository: "other/Revalta" })).toThrow("repository must be");
    expect(() => validateBoundaryTransport({ attempts: 2, retryStatuses: [404], networkErrors: 0, totalBackoffMs: 1 }, "home")).toThrow("non-retryable");
  });

  it("rejects outcome confusion and impossible timing", () => {
    expect(() => validateBoundaryOutcome({ name: "public-home", httpStatus: 302, redirectLocation: "/login" })).toThrow("HTTP 200");
    expect(() => validateBoundaryOutcome({ name: "dashboard-boundary", httpStatus: 307, redirectLocation: "https://evil.example/login" })).toThrow("canonical /login");
    const impossible = attestation(); impossible.boundaries[1] = { ...impossible.boundaries[1], durationMs: 1499 };
    expect(() => validateReleaseAttestation(impossible, {}, { now: NOW })).toThrow("durationMs cannot be shorter");
  });

  it("enforces canonical timestamps and replay limits", () => {
    expect(validateAttestationFreshness("2026-07-28T00:00:00.000Z", { now: NOW, maxAgeSeconds: 300 }).ageMs).toBe(300000);
    expect(() => validateAttestationFreshness("2026-07-28T00:00:00Z", { now: NOW })).toThrow("canonical UTC");
    expect(() => validateAttestationFreshness("2026-07-27T23:59:59.999Z", { now: NOW, maxAgeSeconds: 300 })).toThrow("older than 300 seconds");
  });

  it("verifies files and detects byte manipulation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "revalta-attestation-verify-"));
    const jsonPath = join(directory, "release.json");
    const checksumPath = `${jsonPath}.sha256`;
    const bytes = evidenceBytes();
    const hash = calculateSha256(bytes);
    await writeFile(jsonPath, bytes);
    await writeFile(checksumPath, `${hash}  release.json\n`);
    const verified = await verifyReleaseAttestationFiles({ attestationPath: jsonPath, checksumPath, now: NOW, maxAgeSeconds: 300 });
    expect(verified.checksum).toBe(hash);
    await writeFile(jsonPath, Buffer.concat([bytes, Buffer.from(" ")]));
    await expect(verifyReleaseAttestationFiles({ attestationPath: jsonPath, checksumPath, now: NOW })).rejects.toThrow("checksum mismatch");
    expect(await readFile(checksumPath, "utf8")).toContain(hash);
  });
});