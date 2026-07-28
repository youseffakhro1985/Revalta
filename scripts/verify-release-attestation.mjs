import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const CANONICAL_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const EXPECTED_BOUNDARIES = ["public-home", "dashboard-boundary", "health-api"];
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const PRODUCTION_ORIGIN = "https://www.revalta.se";
const EXPECTED_REPOSITORY = "youseffakhro1985/Revalta";
const EXPECTED_WORKFLOW = "Strict Release Boundary Gate";
const EXPECTED_WORKFLOW_PATH = "/.github/workflows/strict-release-boundary-gate.yml@";
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function invariant(condition, message) { if (!condition) throw new Error(message); }

export function parseChecksumFile(value, expectedFilename) {
  const match = String(value).trim().match(/^([0-9a-fA-F]{64})  (.+)$/);
  invariant(match, "Checksum file must use '<sha256>  <filename>' format");
  invariant(match[2] === expectedFilename, `Checksum filename mismatch: expected ${expectedFilename}`);
  return match[1].toLowerCase();
}

export function calculateSha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

export function verifyChecksum(bytes, expectedHash) {
  invariant(SHA256_PATTERN.test(expectedHash), "Expected checksum must be a 64-character SHA-256 value");
  const actual = Buffer.from(calculateSha256(bytes), "hex");
  const expected = Buffer.from(expectedHash.toLowerCase(), "hex");
  invariant(actual.length === expected.length && timingSafeEqual(actual, expected), "Release attestation checksum mismatch");
  return actual.toString("hex");
}

export function validateAttestationFreshness(checkedAt, { now = new Date(), maxAgeSeconds } = {}) {
  invariant(typeof checkedAt === "string" && CANONICAL_ISO_PATTERN.test(checkedAt), "Release attestation checkedAt must be a canonical UTC ISO timestamp");
  const checkedAtMs = Date.parse(checkedAt);
  invariant(!Number.isNaN(checkedAtMs) && new Date(checkedAtMs).toISOString() === checkedAt, "Release attestation checkedAt must be a real canonical UTC timestamp");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  invariant(Number.isFinite(nowMs), "Attestation verification clock must be valid");
  invariant(checkedAtMs <= nowMs + MAX_CLOCK_SKEW_MS, "Release attestation checkedAt is too far in the future");
  if (maxAgeSeconds !== undefined) {
    invariant(Number.isInteger(maxAgeSeconds) && maxAgeSeconds > 0, "maxAgeSeconds must be a positive integer");
    invariant(nowMs - checkedAtMs <= maxAgeSeconds * 1000, `Release attestation is older than ${maxAgeSeconds} seconds`);
  }
  return { checkedAtMs, ageMs: Math.max(0, nowMs - checkedAtMs) };
}

export function validateReleaseProvenance(provenance, expected = {}) {
  invariant(provenance && typeof provenance === "object" && !Array.isArray(provenance), "Release provenance is required");
  invariant(REPOSITORY_PATTERN.test(provenance.repository), "Release provenance repository must use owner/name format");
  invariant(provenance.repository === EXPECTED_REPOSITORY, `Release provenance repository must be ${EXPECTED_REPOSITORY}`);
  invariant(provenance.workflow === EXPECTED_WORKFLOW, `Release provenance workflow must be ${EXPECTED_WORKFLOW}`);
  invariant(typeof provenance.workflowRef === "string" && provenance.workflowRef.startsWith(`${EXPECTED_REPOSITORY}${EXPECTED_WORKFLOW_PATH}`), "Release provenance workflowRef is not the controlled workflow");
  invariant(POSITIVE_INTEGER_PATTERN.test(String(provenance.runId)), "Release provenance runId must be a positive integer");
  invariant(Number.isSafeInteger(provenance.runAttempt) && provenance.runAttempt > 0, "Release provenance runAttempt must be a positive integer");
  const serverUrl = new URL(provenance.serverUrl);
  invariant(serverUrl.protocol === "https:" && serverUrl.origin === provenance.serverUrl, "Release provenance serverUrl must be a clean HTTPS origin");
  invariant(serverUrl.hostname === "github.com", "Release provenance serverUrl must be https://github.com");
  const expectedRunUrl = `${serverUrl.origin}/${provenance.repository}/actions/runs/${provenance.runId}`;
  invariant(provenance.runUrl === expectedRunUrl, "Release provenance runUrl mismatch");
  if (expected.repository) invariant(provenance.repository === expected.repository, "Attestation repository does not match expected provenance");
  if (expected.workflow) invariant(provenance.workflow === expected.workflow, "Attestation workflow does not match expected provenance");
  if (expected.runId) invariant(String(provenance.runId) === String(expected.runId), "Attestation runId does not match expected provenance");
  if (expected.runAttempt) invariant(provenance.runAttempt === expected.runAttempt, "Attestation runAttempt does not match expected provenance");
  return provenance;
}

export function validateBoundaryTransport(transport, label) {
  invariant(transport && typeof transport === "object" && !Array.isArray(transport), `${label}: transport evidence is required`);
  invariant(Number.isSafeInteger(transport.attempts) && transport.attempts > 0, `${label}: attempts must be a positive integer`);
  invariant(Array.isArray(transport.retryStatuses), `${label}: retryStatuses must be an array`);
  invariant(Number.isSafeInteger(transport.networkErrors) && transport.networkErrors >= 0, `${label}: networkErrors must be non-negative`);
  invariant(Number.isSafeInteger(transport.totalBackoffMs) && transport.totalBackoffMs >= 0, `${label}: totalBackoffMs must be non-negative`);
  invariant(transport.retryStatuses.length + transport.networkErrors === transport.attempts - 1, `${label}: retry evidence count mismatch`);
  for (const status of transport.retryStatuses) invariant(RETRYABLE_HTTP_STATUSES.has(status), `${label}: non-retryable status in retry evidence`);
  if (transport.attempts === 1) invariant(transport.totalBackoffMs === 0, `${label}: first-attempt success cannot include backoff`);
  return transport;
}

export function validateReleaseAttestation(attestation, expected = {}, options = {}) {
  invariant(attestation && typeof attestation === "object" && !Array.isArray(attestation), "Attestation must be a JSON object");
  invariant(attestation.schemaVersion === 3, "Unsupported release attestation schemaVersion");
  invariant(attestation.kind === "revalta.release-boundary-attestation", "Unexpected release attestation kind");
  invariant(attestation.verdict === "passed", "Release attestation verdict must be passed");
  const freshness = validateAttestationFreshness(attestation.checkedAt, options);
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
  const provenance = validateReleaseProvenance(attestation.provenance, expected.provenance ?? {});
  invariant(Array.isArray(attestation.boundaries), "Release boundaries must be an array");
  const names = attestation.boundaries.map((boundary) => boundary?.name);
  invariant(JSON.stringify(names) === JSON.stringify(EXPECTED_BOUNDARIES), `Release boundaries must be exactly ${EXPECTED_BOUNDARIES.join(", ")}`);
  for (const boundary of attestation.boundaries) {
    invariant(Number.isInteger(boundary.httpStatus) && boundary.httpStatus >= 100 && boundary.httpStatus <= 599, `${boundary.name}: invalid HTTP status`);
    invariant(Number.isInteger(boundary.durationMs) && boundary.durationMs >= 0, `${boundary.name}: durationMs must be a non-negative integer`);
    invariant(boundary.redirectLocation === null || typeof boundary.redirectLocation === "string", `${boundary.name}: invalid redirectLocation`);
    const transport = validateBoundaryTransport(boundary.transport, boundary.name);
    invariant(boundary.durationMs >= transport.totalBackoffMs, `${boundary.name}: durationMs cannot be shorter than totalBackoffMs`);
  }
  if (expected.commitSha) invariant(release.commitSha === expected.commitSha.toLowerCase(), "Attestation commit SHA does not match expected release");
  if (expected.environment) invariant(release.environment === expected.environment, "Attestation environment does not match expected release");
  if (expected.branch) invariant(release.branch === expected.branch, "Attestation branch does not match expected release");
  if (expected.origin) invariant(release.origin === expected.origin, "Attestation origin does not match expected release");
  return { attestation, freshness, provenance };
}

export async function verifyReleaseAttestationFiles({ attestationPath, checksumPath, expected = {}, now, maxAgeSeconds }) {
  const resolvedAttestationPath = resolve(attestationPath);
  const resolvedChecksumPath = resolve(checksumPath ?? `${attestationPath}.sha256`);
  const [bytes, checksumText] = await Promise.all([readFile(resolvedAttestationPath), readFile(resolvedChecksumPath, "utf8")]);
  const expectedHash = parseChecksumFile(checksumText, basename(resolvedAttestationPath));
  const checksum = verifyChecksum(bytes, expectedHash);
  let attestation;
  try { attestation = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("Release attestation is not valid JSON"); }
  const validation = validateReleaseAttestation(attestation, expected, { now, maxAgeSeconds });
  return { attestation: validation.attestation, freshness: validation.freshness, provenance: validation.provenance, checksum, attestationPath: resolvedAttestationPath, checksumPath: resolvedChecksumPath };
}

function parseOptionalPositiveInteger(value, label) {
  if (value === undefined || value === "") return undefined;
  invariant(/^\d+$/.test(value), `${label} must be a positive integer`);
  const parsed = Number(value);
  invariant(Number.isSafeInteger(parsed) && parsed > 0, `${label} must be a positive integer`);
  return parsed;
}

async function main() {
  const attestationPath = process.env.RELEASE_ATTESTATION_PATH || process.argv[2] || "artifacts/release-boundary-attestation.json";
  const checksumPath = process.env.RELEASE_ATTESTATION_CHECKSUM_PATH || process.argv[3] || `${attestationPath}.sha256`;
  const maxAgeSeconds = parseOptionalPositiveInteger(process.env.MAX_ATTESTATION_AGE_SECONDS, "MAX_ATTESTATION_AGE_SECONDS");
  const result = await verifyReleaseAttestationFiles({
    attestationPath, checksumPath, maxAgeSeconds,
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
  console.log(`Release attestation verified: ${result.attestation.release.commitSha}`);
  console.log(`SHA-256: ${result.checksum}`);
  console.log(`Age: ${Math.floor(result.freshness.ageMs / 1000)} seconds`);
  console.log(`Provenance: ${result.provenance.runUrl} attempt ${result.provenance.runAttempt}`);
  for (const boundary of result.attestation.boundaries) console.log(`- ${boundary.name}: ${boundary.transport.attempts} attempt(s), ${boundary.transport.totalBackoffMs} ms backoff`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
