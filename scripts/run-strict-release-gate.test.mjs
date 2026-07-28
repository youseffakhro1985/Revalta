import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReleaseAttestation, writeReleaseAttestation } from "./run-strict-release-gate.mjs";

const SHA = "3faf049f8ba51b577824d53a18fff71ac6a34420";
const target = {
  baseUrl: "https://revalta-release-preview.vercel.app",
  expectedSha: SHA,
  environment: "preview",
  branch: "release-preview",
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

describe("strict release attestation", () => {
  it("creates a stable, secret-free passed attestation", () => {
    const attestation = buildReleaseAttestation({
      target,
      report: report(),
      checkedAt: new Date("2026-07-28T00:00:00.000Z"),
    });

    expect(attestation).toEqual({
      schemaVersion: 1,
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
      boundaries: [
        { name: "public-home", httpStatus: 200, durationMs: 12, redirectLocation: null },
        { name: "dashboard-boundary", httpStatus: 307, durationMs: 8, redirectLocation: "/login" },
        { name: "health-api", httpStatus: 200, durationMs: 16, redirectLocation: null },
      ],
    });

    const serialized = JSON.stringify(attestation);
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("cookie");
    expect(serialized).not.toContain("token");
  });

  it("rejects evidence assembled from a different release", () => {
    expect(() => buildReleaseAttestation({
      target,
      report: report({ release: "1111111111111111111111111111111111111111" }),
    })).toThrow("SHA mismatch");
    expect(() => buildReleaseAttestation({
      target,
      report: report({ environment: "production" }),
    })).toThrow("environment mismatch");
    expect(() => buildReleaseAttestation({
      target,
      report: report({ branch: "main" }),
    })).toThrow("branch mismatch");
    expect(() => buildReleaseAttestation({
      target,
      report: report({ baseUrl: "https://other.vercel.app" }),
    })).toThrow("base URL mismatch");
  });

  it("writes deterministic JSON atomically with private permissions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "revalta-release-attestation-"));
    const path = join(directory, "nested", "attestation.json");
    const attestation = buildReleaseAttestation({
      target,
      report: report(),
      checkedAt: new Date("2026-07-28T00:00:00.000Z"),
    });

    const writtenPath = await writeReleaseAttestation(path, attestation);
    expect(writtenPath).toBe(path);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(attestation);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});
