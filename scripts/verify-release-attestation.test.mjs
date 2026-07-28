import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateSha256,
  parseChecksumFile,
  validateAttestationFreshness,
  validateReleaseAttestation,
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

function attestation(overrides = {}) {
  return {
    schemaVersion: 2,
    kind: "revalta.release-boundary-attestation",
    verdict: "passed",
    checkedAt: "2026-07-28T00:00:00.000Z",
    release: {
      commitSha: SHA,
      shortCommitSha: SHA.slice(0, 7),
      environment: "preview",
      branch: "release-preview",
      origin: "https://revalta-release-preview.vercel.app",
    },
    provenance,
    boundaries: [
      { name: "public-home", httpStatus: 200, durationMs: 10, redirectLocation: null },
      { name: "dashboard-boundary", httpStatus: 307, durationMs: 8, redirectLocation: "/login" },
      { name: "health-api", httpStatus: 200, durationMs: 12, redirectLocation: null },
    ],
    ...overrides,
  };
}

describe("release attestation verifier", () => {
  it("parses the standard checksum format", () => {
    const hash = "a".repeat(64);
    expect(parseChecksumFile(`${hash}  release.json\n`, "release.json")).toBe(hash);
    expect(() => parseChecksumFile(`${hash} release.json`, "release.json")).toThrow("format");
    expect(() => parseChecksumFile(`${hash}  other.json`, "release.json")).toThrow("filename mismatch");
  });

  it("validates schema, release identity, provenance and exact boundaries", () => {
    expect(() => validateReleaseAttestation(attestation(), {
      commitSha: SHA,
      environment: "preview",
      branch: "release-preview",
      origin: "https://revalta-release-preview.vercel.app",
      provenance: { runId: provenance.runId, runAttempt: 1 },
    }, { now: NOW })).not.toThrow();

    expect(() => validateReleaseAttestation(attestation({ verdict: "failed" }), {}, { now: NOW })).toThrow("verdict");
    expect(() => validateReleaseAttestation(attestation({ schemaVersion: 1 }), {}, { now: NOW })).toThrow("schemaVersion");
    expect(() => validateReleaseAttestation(attestation({ boundaries: [] }), {}, { now: NOW })).toThrow("exactly");
    expect(() => validateReleaseAttestation(attestation(), { commitSha: "1".repeat(40) }, { now: NOW })).toThrow("commit SHA");
  });

  it("rejects forged or inconsistent GitHub Actions provenance", () => {
    expect(() => validateReleaseProvenance({ ...provenance, repository: "other/Revalta" })).toThrow("repository must be");
    expect(() => validateReleaseProvenance({ ...provenance, workflow: "Other workflow" })).toThrow("workflow must be");
    expect(() => validateReleaseProvenance({ ...provenance, workflowRef: "other/ref" })).toThrow("controlled workflow");
    expect(() => validateReleaseProvenance({ ...provenance, serverUrl: "https://github.example" })).toThrow("github.com");
    expect(() => validateReleaseProvenance({ ...provenance, runUrl: "https://github.com/other/run" })).toThrow("runUrl mismatch");
    expect(() => validateReleaseProvenance(provenance, { runId: "1" })).toThrow("runId does not match");
    expect(() => validateReleaseProvenance(provenance, { runAttempt: 2 })).toThrow("runAttempt does not match");
  });

  it("rejects production and preview identity confusion", () => {
    expect(() => validateReleaseAttestation(attestation({
      release: { ...attestation().release, environment: "production", branch: "main" },
    }), {}, { now: NOW })).toThrow("www.revalta.se");
    expect(() => validateReleaseAttestation(attestation({
      release: { ...attestation().release, origin: "https://preview.example" },
    }), {}, { now: NOW })).toThrow("Vercel preview");
  });

  it("enforces canonical timestamps and detects replayed evidence", () => {
    expect(validateAttestationFreshness("2026-07-28T00:00:00.000Z", {
      now: NOW,
      maxAgeSeconds: 300,
    })).toEqual({ checkedAtMs: Date.parse("2026-07-28T00:00:00.000Z"), ageMs: 300_000 });

    expect(() => validateAttestationFreshness("2026-07-28T00:00:00Z", { now: NOW })).toThrow("canonical UTC");
    expect(() => validateAttestationFreshness("2026-02-30T00:00:00.000Z", { now: NOW })).toThrow("real canonical");
    expect(() => validateAttestationFreshness("2026-07-27T23:59:59.999Z", { now: NOW, maxAgeSeconds: 300 })).toThrow("older than 300 seconds");
    expect(() => validateAttestationFreshness("2026-07-28T00:10:00.001Z", { now: NOW })).toThrow("future");
    expect(() => validateAttestationFreshness("2026-07-28T00:10:00.000Z", { now: NOW })).not.toThrow();
    expect(() => validateAttestationFreshness("2026-07-28T00:00:00.000Z", { now: NOW, maxAgeSeconds: 0 })).toThrow("positive integer");
  });

  it("verifies files, provenance, freshness and any byte manipulation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "revalta-attestation-verify-"));
    const jsonPath = join(directory, "release.json");
    const checksumPath = `${jsonPath}.sha256`;
    const bytes = Buffer.from(`${JSON.stringify(attestation(), null, 2)}\n`, "utf8");
    const hash = calculateSha256(bytes);
    await writeFile(jsonPath, bytes);
    await writeFile(checksumPath, `${hash}  release.json\n`);

    const verified = await verifyReleaseAttestationFiles({
      attestationPath: jsonPath,
      checksumPath,
      now: NOW,
      maxAgeSeconds: 300,
      expected: { provenance: { runId: provenance.runId } },
    });
    expect(verified.checksum).toBe(hash);
    expect(verified.attestation.release.commitSha).toBe(SHA);
    expect(verified.provenance.runUrl).toBe(provenance.runUrl);
    expect(verified.freshness.ageMs).toBe(300_000);

    await writeFile(jsonPath, Buffer.concat([bytes, Buffer.from(" ")]));
    await expect(verifyReleaseAttestationFiles({ attestationPath: jsonPath, checksumPath, now: NOW })).rejects.toThrow("checksum mismatch");
    expect(await readFile(checksumPath, "utf8")).toContain(hash);
  });
});
