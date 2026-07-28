import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateSha256,
  parseChecksumFile,
  validateReleaseAttestation,
  verifyReleaseAttestationFiles,
} from "./verify-release-attestation.mjs";

const SHA = "9d3ce1f5530a55e9e817c85933f2683dab69bb77";

function attestation(overrides = {}) {
  return {
    schemaVersion: 1,
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

  it("validates schema, release identity and exact boundaries", () => {
    expect(() => validateReleaseAttestation(attestation(), {
      commitSha: SHA,
      environment: "preview",
      branch: "release-preview",
      origin: "https://revalta-release-preview.vercel.app",
    })).not.toThrow();

    expect(() => validateReleaseAttestation(attestation({ verdict: "failed" }))).toThrow("verdict");
    expect(() => validateReleaseAttestation(attestation({ schemaVersion: 2 }))).toThrow("schemaVersion");
    expect(() => validateReleaseAttestation(attestation({ boundaries: [] }))).toThrow("exactly");
    expect(() => validateReleaseAttestation(attestation(), { commitSha: "1".repeat(40) })).toThrow("commit SHA");
  });

  it("rejects production and preview identity confusion", () => {
    expect(() => validateReleaseAttestation(attestation({
      release: { ...attestation().release, environment: "production", branch: "main" },
    }))).toThrow("www.revalta.se");
    expect(() => validateReleaseAttestation(attestation({
      release: { ...attestation().release, origin: "https://preview.example" },
    }))).toThrow("Vercel preview");
  });

  it("verifies files and detects any byte manipulation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "revalta-attestation-verify-"));
    const jsonPath = join(directory, "release.json");
    const checksumPath = `${jsonPath}.sha256`;
    const bytes = Buffer.from(`${JSON.stringify(attestation(), null, 2)}\n`, "utf8");
    const hash = calculateSha256(bytes);
    await writeFile(jsonPath, bytes);
    await writeFile(checksumPath, `${hash}  release.json\n`);

    const verified = await verifyReleaseAttestationFiles({ attestationPath: jsonPath, checksumPath });
    expect(verified.checksum).toBe(hash);
    expect(verified.attestation.release.commitSha).toBe(SHA);

    await writeFile(jsonPath, Buffer.concat([bytes, Buffer.from(" ")]));
    await expect(verifyReleaseAttestationFiles({ attestationPath: jsonPath, checksumPath })).rejects.toThrow("checksum mismatch");
    expect(await readFile(checksumPath, "utf8")).toContain(hash);
  });
});
