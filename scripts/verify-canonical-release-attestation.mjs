import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyReleaseAttestationSnapshot } from "./verify-release-attestation.mjs";

const MAX_ATTESTATION_BYTES = 1024 * 1024;
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const CANONICAL_KEY_ORDER = [
  "schemaVersion", "kind", "verdict", "checkedAt", "policy", "release", "provenance", "boundaries",
  "id", "sha256",
  "commitSha", "shortCommitSha", "environment", "branch", "origin",
  "repository", "workflow", "workflowRef", "runId", "runAttempt", "serverUrl", "runUrl",
  "name", "request", "httpStatus", "durationMs", "redirectLocation", "transport",
  "method", "path",
  "attempts", "retryStatuses", "networkErrors", "totalBackoffMs",
];
const CANONICAL_KEY_PRIORITY = new Map(CANONICAL_KEY_ORDER.map((key, index) => [key, index]));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function compareCanonicalKeys(left, right) {
  const leftPriority = CANONICAL_KEY_PRIORITY.get(left);
  const rightPriority = CANONICAL_KEY_PRIORITY.get(right);
  if (leftPriority !== undefined || rightPriority !== undefined) {
    if (leftPriority === undefined) return 1;
    if (rightPriority === undefined) return -1;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  }
  return left.localeCompare(right, "en");
}

export function canonicalizeJsonValue(value) {
  if (Array.isArray(value)) return value.map((entry) => canonicalizeJsonValue(entry));
  if (value && typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value).sort(compareCanonicalKeys)) {
      output[key] = canonicalizeJsonValue(value[key]);
    }
    return output;
  }
  return value;
}

export function serializeCanonicalJson(value) {
  return `${JSON.stringify(canonicalizeJsonValue(value), null, 2)}\n`;
}

export function verifyCanonicalAttestationBytes(bytes, { maxBytes = MAX_ATTESTATION_BYTES } = {}) {
  invariant(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array, "Release attestation bytes are required");
  invariant(Number.isSafeInteger(maxBytes) && maxBytes > 0, "Canonical attestation maxBytes must be a positive integer");
  invariant(bytes.byteLength > 0, "Release attestation must not be empty");
  invariant(bytes.byteLength <= maxBytes, `Release attestation exceeds ${maxBytes} byte canonical limit`);

  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  invariant(!(buffer.length >= UTF8_BOM.length && buffer.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)), "Release attestation must not contain a UTF-8 BOM");

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error("Release attestation is not valid UTF-8");
  }

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

export async function verifyCanonicalReleaseAttestationFiles({ attestationPath, checksumPath, expected = {}, now, maxAgeSeconds, maxBytes, maxChecksumBytes } = {}) {
  invariant(typeof attestationPath === "string" && attestationPath.length > 0, "attestationPath is required");
  const resolvedAttestationPath = resolve(attestationPath);
  const resolvedChecksumPath = resolve(checksumPath ?? `${attestationPath}.sha256`);
  const [attestationBytes, checksumBytes] = await Promise.all([
    readFile(resolvedAttestationPath),
    readFile(resolvedChecksumPath),
  ]);
  verifyCanonicalAttestationBytes(attestationBytes, { maxBytes });
  const verified = verifyReleaseAttestationSnapshot({
    attestationBytes,
    checksumBytes,
    expectedFilename: basename(resolvedAttestationPath),
    expected,
    now,
    maxAgeSeconds,
    maxChecksumBytes,
  });
  return { ...verified, attestationPath: resolvedAttestationPath, checksumPath: resolvedChecksumPath };
}

async function main() {
  const attestationPath = process.env.RELEASE_ATTESTATION_PATH || process.argv[2] || "artifacts/release-boundary-attestation.json";
  const checksumPath = process.env.RELEASE_ATTESTATION_CHECKSUM_PATH || process.argv[3] || `${attestationPath}.sha256`;
  const maxAgeSeconds = parseOptionalPositiveInteger(process.env.MAX_ATTESTATION_AGE_SECONDS, "MAX_ATTESTATION_AGE_SECONDS");
  const maxBytes = parseOptionalPositiveInteger(process.env.MAX_ATTESTATION_BYTES, "MAX_ATTESTATION_BYTES");
  const maxChecksumBytes = parseOptionalPositiveInteger(process.env.MAX_CHECKSUM_BYTES, "MAX_CHECKSUM_BYTES");
  const result = await verifyCanonicalReleaseAttestationFiles({
    attestationPath,
    checksumPath,
    maxAgeSeconds,
    maxBytes,
    maxChecksumBytes,
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