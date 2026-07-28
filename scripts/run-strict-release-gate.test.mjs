import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildReleaseAttestation,
  calculateReleaseAttestationChecksum,
  serializeReleaseAttestation,
  validateReleaseProvenance,
  writeReleaseAttestation,
} from "./run-strict-release-gate.mjs";

const SHA = "3faf049f8ba51b577824d53a18fff71ac6a34420";
const target = {
  baseUrl: "https://revalta-release-preview.vercel.app",
  expectedSha: SHA,
  environment: "preview",
  branch: "release-preview",
};
const provenance = {
  repository: "youseffakhro1985/Revalta",
  workflow: "Strict Release Boundary Gate",
  workflowRef: "youseffakhro1985/Revalta/.github/workflows/strict-release-boundary-gate.yml@refs/heads/release-preview",
  runId: "30320000000",
  runAttempt: 1,
  serverUrl: "https://github.com",
  runUrl: "https://github.com/youseffakhro1985/Revalta/actions/runs/30320000000",
};

function report(overrides = {}) {
  return {
    baseUrl: target.baseUrl,
    release: SHA,
    environment: "preview",
    branch: "release-preview",
    results: [
      { label: "public-home", status: 200, durationMs: 12, location: null },
      { label: "dashboard-boundary", status: 307, durationMs: 8, location: "/login" },
      { label: "health-api", status: 200, durationMs: 16, location: null },
    ],
    ...overrides,
  };
}

function attestation() {
  return buildReleaseAttestation({
    target,
    report: report(),
    provenance,
    checkedAt: new Date("2026-07-28T00:00:00.000Z"),
  });
}

describe("strict release attestation", () => {
  it("creates stable, secret-free evidence with controlled provenance", () => {
    const evidence = attestation();

    expect(evidence).toEqual({
      schemaVersion: 2,
      kind: "revalta.release-boundary-attestation",
      verdict: "passed",
      checkedAt: "2026-07-28T00:00:00.000Z",
      release: {
        commitSha: SHA,
        shortCommitSha: SHA.slice(0, 7),
        environment: "preview",
        branch: "release-preview",
        origin: target.baseUrl,
      },
      provenance,
      boundaries: [
        { name: "public-home", httpStatus: 200, durationMs: 12, redirectLocation: null },
        { name: "dashboard-boundary", httpStatus: 307, durationMs: 8, redirectLocation: "/login" },
        { name: "health-api", httpStatus: 200, durationMs: 16, redirectLocation: null },
      ],
    });

    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("cookie");
    expect(serialized).not.toContain("token");
  });

  it("rejects invalid or internally inconsistent provenance", () => {
    expect(() => validateReleaseProvenance({ ...provenance, repository: "invalid" })).toThrow("owner/name");
    expect(() => validateReleaseProvenance({ ...provenance, workflowRef: "invalid" })).toThrow("workflowRef");
    expect(() => validateReleaseProvenance({ ...provenance, runId: "0" })).toThrow("runId");
    expect(() => validateReleaseProvenance({ ...provenance, runAttempt: 0 })).toThrow("runAttempt");
    expect(() => validateReleaseProvenance({ ...provenance, runUrl: "https://github.com/other/run" })).toThrow("runUrl mismatch");
  });

  it("rejects evidence assembled from a different release", () => {
    expect(() => buildReleaseAttestation({
      target,
      provenance,
      report: report({ release: "1111111111111111111111111111111111111111" }),
    })).toThrow("SHA mismatch");
    expect(() => buildReleaseAttestation({ target, provenance, report: report({ environment: "production" }) })).toThrow("environment mismatch");
    expect(() => buildReleaseAttestation({ target, provenance, report: report({ branch: "main" }) })).toThrow("branch mismatch");
    expect(() => buildReleaseAttestation({ target, provenance, report: report({ baseUrl: "https://other.vercel.app" }) })).toThrow("base URL mismatch");
  });

  it("serializes deterministically and detects byte-level changes", () => {
    const serialized = serializeReleaseAttestation(attestation());
    expect(serialized.endsWith("\n")).toBe(true);
    expect(serializeReleaseAttestation(attestation())).toBe(serialized);

    const checksum = calculateReleaseAttestationChecksum(serialized);
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(calculateReleaseAttestationChecksum(serialized)).toBe(checksum);
    expect(calculateReleaseAttestationChecksum(serialized.replace("passed", "failed"))).not.toBe(checksum);
  });

  it("writes JSON and checksum atomically with private permissions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "revalta-release-attestation-"));
    const path = join(directory, "nested", "attestation.json");
    const evidence = attestation();
    const serialized = serializeReleaseAttestation(evidence);
    const expectedChecksum = calculateReleaseAttestationChecksum(serialized);

    const written = await writeReleaseAttestation(path, evidence);
    expect(written.outputPath).toBe(path);
    expect(written.checksumPath).toBe(`${path}.sha256`);
    expect(written.checksum).toBe(expectedChecksum);
    expect(await readFile(path, "utf8")).toBe(serialized);
    expect(await readFile(`${path}.sha256`, "utf8")).toBe(`${expectedChecksum}  attestation.json\n`);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(`${path}.sha256`)).mode & 0o777).toBe(0o600);
  });
});
