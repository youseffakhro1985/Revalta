import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { verifyReleaseAttestationFiles } from "./verify-release-attestation.mjs";

const MAX_ATTESTATION_BYTES = 1024 * 1024;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function serializeCanonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function verifyCanonicalAttestationBytes(bytes, { maxBytes = MAX_ATTESTATION_BYTES } = {}) {
  invariant(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array, "Release attestation bytes are required");
  invariant(Number.isSafeInteger(maxBytes) && maxBytes > 0, "Canonical attestation maxBytes must be a positive integer");
  invariant(bytes.byteLength > 0, "Release attestation must not be empty");
  invariant(bytes.byteLength <= maxBytes, `Release attestation exceeds ${maxBytes} byte canonical limit`);

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Release attestation is not valid UTF-8");
  }
  invariant(!text.startsWith("\uFEFF"), "Release attestation must not contain a UTF-8 BOM");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Release attestation is not valid JSON");
  }

  const canonical = serializeCanonicalJson(parsed);
  invariant(text === canonical, "Release attestation must use Revalta canonical JSON bytes; duplicate keys, alternate key order or non-canonical whitespace are forbidden");
  return parsed;
}

function parseOptionalPositiveInteger(value, label) {
  if (value === undefined || value === "") return undefined;
  invariant(/^\d+$/.test(value), `${label} must be a positive integer`);
  const parsed = Number(value);
  invariant(Number.isSafeInteger(parsed) && parsed > 0, `${label} must be a positive integer`);
  return parsed;
}

export async function verifyCanonicalReleaseAttestationFiles({ attestationPath, checksumPath, expected = {}, now, maxAgeSeconds, maxBytes } = {}) {
  invariant(typeof attestationPath === "string" && attestationPath.length > 0, "attestationPath is required");
  const bytes = await readFile(attestationPath);
  verifyCanonicalAttestationBytes(bytes, { maxBytes });
  return verifyReleaseAttestationFiles({ attestationPath, checksumPath, expected, now, maxAgeSeconds });
}

async function main() {
  const attestationPath = process.env.RELEASE_ATTESTATION_PATH || process.argv[2] || "artifacts/release-boundary-attestation.json";
  const checksumPath = process.env.RELEASE_ATTESTATION_CHECKSUM_PATH || process.argv[3] || `${attestationPath}.sha256`;
  const maxAgeSeconds = parseOptionalPositiveInteger(process.env.MAX_ATTESTATION_AGE_SECONDS, "MAX_ATTESTATION_AGE_SECONDS");
  const maxBytes = parseOptionalPositiveInteger(process.env.MAX_ATTESTATION_BYTES, "MAX_ATTESTATION_BYTES");
  const result = await verifyCanonicalReleaseAttestationFiles({
    attestationPath,
    checksumPath,
    maxAgeSeconds,
    maxBytes,
    expected: {
      commitSha: process.env.EXPECTED_SHA?.trim().toLowerCase() || undefined,
      environment: process.env.EXPECTED_ENVIRONMENT?.trim() || undefined,
      branch: process.env.EXPECTED_BRANCH?.trim() || undefined,
      origin: process.env.BASE_URL?.trim() || undefined,
      provenance: {
        repository: process.env.EXPECTED_REPOSITORY?.trim() || undefined,
        workflow: process.env.EXPECTED_WORKFLOW?.trim() || undefined,
        runId: process.env.EXPECTED_RUN_ID?.trim() || undefined,
        runAttempt: parseOptionalPositiveInteger(process.env.EXPECTED_RUN_ATTEMPT, "EXPECTED_RUN_ATTEMPT"),
      },
    },
  });
  console.log(`Canonical release attestation verified: ${result.attestation.release.commitSha}`);
  console.log(`SHA-256: ${result.checksum}`);
  console.log(`Policy: ${result.policy.id} (${result.policy.sha256})`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
