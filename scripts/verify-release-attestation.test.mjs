import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateSha256,
  parseChecksumFile,
  validateAttestationFreshness,
  validateBoundaryTransport,
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
const clean = { attempts: 1, retryStatuses: [], networkErrors: 0, totalBackoffMs: 0 };

function attestation(overrides = {}) {
  return {
    schemaVersion: 3,
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
      { name: "public-home", httpStatus: 200, durationMs: 10, redirectLocation: null, transport: clean },
      { name: "dashboard-boundary", httpStatus: 307, durationMs: 1_508, redirectLocation: "/login", transport: { attempts: 2, retryStatuses: [503], networkErrors: 0, totalBackoffMs: 1_500 } },
      { name: "health-api", httpStatus: 200, durationMs: 1_512, redirectLocation: null, transport: { attempts: 2, retryStatuses: [], networkErrors: 1, totalBackoffMs: 1_500 } },
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

  it("validates schema v3, identity, provenance and exact boundaries", () => {
    expect(() => validateReleaseAttestation(attestation(), {
      commitSha: SHA,
      environment: "preview",
      branch: "release-preview",
      origin: "https://revalta-release-preview.vercel.app",
      provenance: { runId: provenance.runId, runAttempt: 1 },
    }, { now: NOW })).not.toThrow();
    expect(() => validateReleaseAttestation(attestation({ schemaVersion: 2 }), {}, { now: NOW })).toThrow("schemaVersion");
    expect(() => validateReleaseAttestation(attestation({ boundaries: [] }), {}, { now: NOW })).toThrow("exactly");
  });

  it("rejects forged provenance and impossible retry evidence", () => {
    expect(() => validateReleaseProvenance({ ...provenance, repository: "other/Revalta" })).toThrow("repository must be");
    expect(() => validateReleaseProvenance({ ...provenance, runUrl: "https://github.com/other/run" })).toThrow("runUrl mismatch");
    expect(() => validateBoundaryTransport({ attempts: 2, retryStatuses: [], networkErrors: 0, totalBackoffMs: 1 }, "home")).toThrow("count mismatch");
    expect(() => validateBoundaryTransport({ attempts: 2, retryStatuses: [404], networkErrors: 0, totalBackoffMs: 1 }, "home")).toThrow("non-retryable");
    expect(() => validateBoundaryTransport({ attempts: 1, retryStatuses: [], networkErrors: 0, totalBackoffMs: 1 }, "home")).toThrow("cannot include backoff");
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
    expect(verified.attestation.boundaries[1].transport.retryStatuses).toEqual([503]);
    await writeFile(jsonPath, Buffer.concat([bytes, Buffer.from(" ")]));
    await expect(verifyReleaseAttestationFiles({ attestationPath: jsonPath, checksumPath, now: NOW })).rejects.toThrow("checksum mismatch");
    expect(await readFile(checksumPath, "utf8")).toContain(hash);
  });
});
