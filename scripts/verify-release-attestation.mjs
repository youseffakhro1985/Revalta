import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const EXPECTED_BOUNDARIES = ["public-home", "dashboard-boundary", "health-api"];
const PRODUCTION_ORIGIN = "https://www.revalta.se";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function parseChecksumFile(value, expectedFilename) {
  const match = String(value).trim().match(/^([0-9a-fA-F]{64})  (.+)$/);
  invariant(match, "Checksum file must use '<sha256>  <filename>' format");
  invariant(match[2] === expectedFilename, `Checksum filename mismatch: expected ${expectedFilename}`);
  return match[1].toLowerCase();
}

export function calculateSha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyChecksum(bytes, expectedHash) {
  invariant(SHA256_PATTERN.test(expectedHash), "Expected checksum must be a 64-character SHA-256 value");
  const actual = Buffer.from(calculateSha256(bytes), "hex");
  const expected = Buffer.from(expectedHash.toLowerCase(), "hex");
  invariant(actual.length === expected.length && timingSafeEqual(actual, expected), "Release attestation checksum mismatch");
  return actual.toString("hex");
}

export function validateReleaseAttestation(attestation, expected = {}) {
  invariant(attestation && typeof attestation === "object" && !Array.isArray(attestation), "Attestation must be a JSON object");
  invariant(attestation.schemaVersion === 1, "Unsupported release attestation schemaVersion");
  invariant(attestation.kind === "revalta.release-boundary-attestation", "Unexpected release attestation kind");
  invariant(attestation.verdict === "passed", "Release attestation verdict must be passed");
  invariant(typeof attestation.checkedAt === "string" && !Number.isNaN(Date.parse(attestation.checkedAt)), "Release attestation checkedAt must be a valid ISO timestamp");

  const release = attestation.release;
  invariant(release && typeof release === "object", "Release metadata is required");
  invariant(SHA_PATTERN.test(release.commitSha), "Release commitSha must be a full 40-character Git SHA");
  invariant(release.shortCommitSha === release.commitSha.slice(0, 7), "Release shortCommitSha mismatch");
  invariant(release.environment === "preview" || release.environment === "production", "Release environment must be preview or production");
  invariant(typeof release.branch === "string" && release.branch.length > 0, "Release branch is required");

  const origin = new URL(release.origin);
  invariant(origin.protocol === "https:" && origin.origin === release.origin, "Release origin must be a clean HTTPS origin");
  if (release.environment === "production") {
    invariant(release.branch === "main", "Production attestation must target branch main");
    invariant(release.origin === PRODUCTION_ORIGIN, `Production attestation must target ${PRODUCTION_ORIGIN}`);
  } else {
    invariant(release.branch === "release-preview", "Preview attestation must target branch release-preview");
    invariant(origin.hostname.endsWith(".vercel.app"), "Preview attestation must target a Vercel preview hostname");
  }

  invariant(Array.isArray(attestation.boundaries), "Release boundaries must be an array");
  const names = attestation.boundaries.map((boundary) => boundary?.name);
  invariant(JSON.stringify(names) === JSON.stringify(EXPECTED_BOUNDARIES), `Release boundaries must be exactly ${EXPECTED_BOUNDARIES.join(", ")}`);
  for (const boundary of attestation.boundaries) {
    invariant(Number.isInteger(boundary.httpStatus) && boundary.httpStatus >= 100 && boundary.httpStatus <= 599, `${boundary.name}: invalid HTTP status`);
    invariant(Number.isInteger(boundary.durationMs) && boundary.durationMs >= 0, `${boundary.name}: durationMs must be a non-negative integer`);
    invariant(boundary.redirectLocation === null || typeof boundary.redirectLocation === "string", `${boundary.name}: invalid redirectLocation`);
  }

  if (expected.commitSha) invariant(release.commitSha === expected.commitSha.toLowerCase(), "Attestation commit SHA does not match expected release");
  if (expected.environment) invariant(release.environment === expected.environment, "Attestation environment does not match expected release");
  if (expected.branch) invariant(release.branch === expected.branch, "Attestation branch does not match expected release");
  if (expected.origin) invariant(release.origin === expected.origin, "Attestation origin does not match expected release");

  return attestation;
}

export async function verifyReleaseAttestationFiles({ attestationPath, checksumPath, expected = {} }) {
  const resolvedAttestationPath = resolve(attestationPath);
  const resolvedChecksumPath = resolve(checksumPath ?? `${attestationPath}.sha256`);
  const [bytes, checksumText] = await Promise.all([
    readFile(resolvedAttestationPath),
    readFile(resolvedChecksumPath, "utf8"),
  ]);
  const expectedHash = parseChecksumFile(checksumText, basename(resolvedAttestationPath));
  const checksum = verifyChecksum(bytes, expectedHash);

  let attestation;
  try {
    attestation = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Release attestation is not valid JSON");
  }
  validateReleaseAttestation(attestation, expected);
  return { attestation, checksum, attestationPath: resolvedAttestationPath, checksumPath: resolvedChecksumPath };
}

async function main() {
  const attestationPath = process.env.RELEASE_ATTESTATION_PATH || process.argv[2] || "artifacts/release-boundary-attestation.json";
  const checksumPath = process.env.RELEASE_ATTESTATION_CHECKSUM_PATH || process.argv[3] || `${attestationPath}.sha256`;
  const result = await verifyReleaseAttestationFiles({
    attestationPath,
    checksumPath,
    expected: {
      commitSha: process.env.EXPECTED_SHA?.trim().toLowerCase() || undefined,
      environment: process.env.EXPECTED_ENVIRONMENT?.trim() || undefined,
      branch: process.env.EXPECTED_BRANCH?.trim() || undefined,
      origin: process.env.BASE_URL?.trim() || undefined,
    },
  });
  console.log(`Release attestation verified: ${result.attestation.release.commitSha}`);
  console.log(`SHA-256: ${result.checksum}`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
