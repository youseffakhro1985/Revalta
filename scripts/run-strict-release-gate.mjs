import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateReleaseTarget } from "./validate-release-target.mjs";
import { renderMarkdownSummary, runReleaseBoundarySmoke } from "./verify-release-boundaries.mjs";

const ATTESTATION_VERSION = 5;
const RELEASE_POLICY_ID = "revalta.strict-release-policy.v1";
const EXPECTED_BOUNDARIES = ["public-home", "dashboard-boundary", "health-api"];
const BOUNDARY_REQUESTS = Object.freeze({
  "public-home": Object.freeze({ method: "GET", path: "/" }),
  "dashboard-boundary": Object.freeze({ method: "GET", path: "/dashboard" }),
  "health-api": Object.freeze({ method: "GET", path: "/api/health" }),
});
const DASHBOARD_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DASHBOARD_DENIAL_STATUSES = new Set([401, 403]);
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

function invariant(condition, message) { if (!condition) throw new Error(message); }

export function buildCanonicalReleasePolicy() {
  return {
    id: RELEASE_POLICY_ID,
    attestationSchemaVersion: ATTESTATION_VERSION,
    boundaries: [
      { name: "public-home", request: { method: "GET", path: "/" }, allowedFinalStatuses: [200], redirect: "forbidden" },
      { name: "dashboard-boundary", request: { method: "GET", path: "/dashboard" }, allowedFinalStatuses: [301, 302, 303, 307, 308, 401, 403], redirect: "canonical-/login-or-null-denial" },
      { name: "health-api", request: { method: "GET", path: "/api/health" }, allowedFinalStatuses: [200], redirect: "forbidden" },
    ],
    retryableHttpStatuses: [408, 425, 429, 500, 502, 503, 504],
    transportEvidence: ["attempts", "retryStatuses", "networkErrors", "totalBackoffMs"],
    durationContract: "monotonic-duration-gte-total-backoff",
  };
}

export function calculateReleasePolicyDigest(policy = buildCanonicalReleasePolicy()) {
  invariant(policy && typeof policy === "object" && !Array.isArray(policy), "Release policy is required");
  return createHash("sha256").update(JSON.stringify(policy), "utf8").digest("hex");
}

export function buildReleasePolicyEvidence() {
  const policy = buildCanonicalReleasePolicy();
  return { id: policy.id, sha256: calculateReleasePolicyDigest(policy) };
}

export function validateReleaseProvenance(provenance) {
  invariant(provenance && typeof provenance === "object" && !Array.isArray(provenance), "Release provenance is required");
  invariant(REPOSITORY_PATTERN.test(provenance.repository), "Release provenance repository must use owner/name format");
  invariant(typeof provenance.workflow === "string" && provenance.workflow.trim().length > 0, "Release provenance workflow is required");
  invariant(typeof provenance.workflowRef === "string" && provenance.workflowRef.includes("/.github/workflows/"), "Release provenance workflowRef is invalid");
  invariant(POSITIVE_INTEGER_PATTERN.test(String(provenance.runId)), "Release provenance runId must be a positive integer");
  invariant(POSITIVE_INTEGER_PATTERN.test(String(provenance.runAttempt)), "Release provenance runAttempt must be a positive integer");
  const serverUrl = new URL(provenance.serverUrl);
  invariant(serverUrl.protocol === "https:" && serverUrl.origin === provenance.serverUrl, "Release provenance serverUrl must be a clean HTTPS origin");
  const expectedRunUrl = `${serverUrl.origin}/${provenance.repository}/actions/runs/${provenance.runId}`;
  invariant(provenance.runUrl === expectedRunUrl, "Release provenance runUrl mismatch");
  return {
    repository: provenance.repository,
    workflow: provenance.workflow.trim(),
    workflowRef: provenance.workflowRef,
    runId: String(provenance.runId),
    runAttempt: Number(provenance.runAttempt),
    serverUrl: serverUrl.origin,
    runUrl: expectedRunUrl,
  };
}

export function buildReleaseProvenance(env = process.env) {
  return validateReleaseProvenance({
    repository: env.GITHUB_REPOSITORY,
    workflow: env.GITHUB_WORKFLOW,
    workflowRef: env.GITHUB_WORKFLOW_REF,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    serverUrl: env.GITHUB_SERVER_URL,
    runUrl: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
  });
}

function validateBoundaryTransport(result) {
  invariant(Number.isSafeInteger(result.attempts) && result.attempts > 0, `${result.label}: attempts must be a positive integer`);
  invariant(Array.isArray(result.retryStatuses), `${result.label}: retryStatuses must be an array`);
  invariant(Number.isSafeInteger(result.networkErrors) && result.networkErrors >= 0, `${result.label}: networkErrors must be non-negative`);
  invariant(Number.isSafeInteger(result.totalBackoffMs) && result.totalBackoffMs >= 0, `${result.label}: totalBackoffMs must be non-negative`);
  invariant(result.retryStatuses.length + result.networkErrors === result.attempts - 1, `${result.label}: retry evidence count mismatch`);
  for (const status of result.retryStatuses) invariant(RETRYABLE_HTTP_STATUSES.has(status), `${result.label}: non-retryable status in retry evidence`);
  if (result.attempts === 1) invariant(result.totalBackoffMs === 0, `${result.label}: first-attempt success cannot include backoff`);
  return {
    attempts: result.attempts,
    retryStatuses: [...result.retryStatuses],
    networkErrors: result.networkErrors,
    totalBackoffMs: result.totalBackoffMs,
  };
}

export function normalizeBoundaryOutcome(result, releaseOrigin) {
  invariant(result && typeof result === "object" && !Array.isArray(result), "Boundary result is required");
  invariant(EXPECTED_BOUNDARIES.includes(result.label), `Unexpected boundary ${result.label}`);
  invariant(Number.isInteger(result.durationMs) && result.durationMs >= 0, `${result.label}: durationMs must be a non-negative integer`);
  const transport = validateBoundaryTransport(result);
  invariant(result.durationMs >= transport.totalBackoffMs, `${result.label}: durationMs cannot be shorter than totalBackoffMs`);

  let redirectLocation = null;
  if (result.label === "public-home") {
    invariant(result.status === 200, "public-home: passed attestation requires HTTP 200");
    invariant(result.location === null || result.location === undefined, "public-home: redirectLocation must be null");
  } else if (result.label === "health-api") {
    invariant(result.status === 200, "health-api: passed attestation requires HTTP 200");
    invariant(result.location === null || result.location === undefined, "health-api: redirectLocation must be null");
  } else if (DASHBOARD_REDIRECT_STATUSES.has(result.status)) {
    invariant(typeof result.location === "string" && result.location.length > 0, "dashboard-boundary: redirect requires Location");
    const destination = new URL(result.location, releaseOrigin);
    const origin = new URL(releaseOrigin);
    invariant(destination.origin === origin.origin, "dashboard-boundary: redirect escaped release origin");
    invariant(destination.pathname === "/login", "dashboard-boundary: redirect must target /login");
    invariant(destination.search === "", "dashboard-boundary: redirect must not contain a query string");
    invariant(destination.hash === "", "dashboard-boundary: redirect must not contain a fragment");
    redirectLocation = "/login";
  } else {
    invariant(DASHBOARD_DENIAL_STATUSES.has(result.status), "dashboard-boundary: passed attestation requires redirect, 401 or 403");
    invariant(result.location === null || result.location === undefined, "dashboard-boundary: denial must not include redirectLocation");
  }

  const request = BOUNDARY_REQUESTS[result.label];
  invariant(request, `${result.label}: request contract is missing`);
  return {
    name: result.label,
    request: { method: request.method, path: request.path },
    httpStatus: result.status,
    durationMs: result.durationMs,
    redirectLocation,
    transport,
  };
}

export function buildReleaseAttestation({ target, report, provenance, checkedAt = new Date() }) {
  invariant(target && report, "Target and boundary report are required");
  invariant(report.release === target.expectedSha, "Attestation release SHA mismatch");
  invariant(report.environment === target.environment, "Attestation environment mismatch");
  invariant(report.branch === target.branch, "Attestation branch mismatch");
  invariant(report.baseUrl === target.baseUrl, "Attestation base URL mismatch");
  invariant(Array.isArray(report.results), "Attestation boundary results are required");
  const names = report.results.map((result) => result?.label);
  invariant(JSON.stringify(names) === JSON.stringify(EXPECTED_BOUNDARIES), `Attestation boundaries must be exactly ${EXPECTED_BOUNDARIES.join(", ")}`);
  return {
    schemaVersion: ATTESTATION_VERSION,
    kind: "revalta.release-boundary-attestation",
    verdict: "passed",
    checkedAt: checkedAt.toISOString(),
    policy: buildReleasePolicyEvidence(),
    release: {
      commitSha: target.expectedSha,
      shortCommitSha: target.expectedSha.slice(0, 7),
      environment: target.environment,
      branch: target.branch,
      origin: target.baseUrl,
    },
    provenance: validateReleaseProvenance(provenance),
    boundaries: report.results.map((result) => normalizeBoundaryOutcome(result, target.baseUrl)),
  };
}

export function serializeReleaseAttestation(attestation) {
  invariant(attestation && typeof attestation === "object", "Release attestation is required");
  return `${JSON.stringify(attestation, null, 2)}\n`;
}

export function calculateReleaseAttestationChecksum(serializedAttestation) {
  invariant(typeof serializedAttestation === "string" && serializedAttestation.length > 0, "Serialized release attestation is required");
  return createHash("sha256").update(serializedAttestation, "utf8").digest("hex");
}

async function writeAtomic(path, content) {
  const outputPath = resolve(path);
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, outputPath);
  return outputPath;
}

export async function writeReleaseAttestation(path, attestation) {
  const outputPath = resolve(path);
  const serialized = serializeReleaseAttestation(attestation);
  const checksum = calculateReleaseAttestationChecksum(serialized);
  const checksumPath = `${outputPath}.sha256`;
  await writeAtomic(outputPath, serialized);
  await writeAtomic(checksumPath, `${checksum}  ${basename(outputPath)}\n`);
  return { outputPath, checksumPath, checksum };
}

export async function runStrictReleaseGate(input, dependencies = {}) {
  const target = validateReleaseTarget(input);
  const report = await runReleaseBoundarySmoke({
    baseUrl: target.baseUrl,
    expectedSha: target.expectedSha,
    expectedEnvironment: target.environment,
    expectedBranch: target.branch,
  }, dependencies);
  const provenance = dependencies.provenance ?? buildReleaseProvenance(dependencies.env);
  const attestation = buildReleaseAttestation({ target, report, provenance, checkedAt: dependencies.checkedAt });
  let writtenAttestation = null;
  if (dependencies.attestationPath) writtenAttestation = await writeReleaseAttestation(dependencies.attestationPath, attestation);
  return { target, report, attestation, writtenAttestation };
}

async function main() {
  const attestationPath = process.env.RELEASE_ATTESTATION_PATH || "artifacts/release-boundary-attestation.json";
  const result = await runStrictReleaseGate({
    baseUrl: process.env.BASE_URL,
    expectedSha: process.env.EXPECTED_SHA,
    environment: process.env.EXPECTED_ENVIRONMENT,
    branch: process.env.EXPECTED_BRANCH,
  }, { attestationPath });
  console.log(`Strict release gate passed for ${result.attestation.release.commitSha}`);
  console.log(`Release attestation written to ${result.writtenAttestation.outputPath}`);
  console.log(`Release attestation SHA-256: ${result.writtenAttestation.checksum}`);
  console.log(`Release policy: ${result.attestation.policy.id} (${result.attestation.policy.sha256})`);
  console.log(`Release provenance: ${result.attestation.provenance.runUrl} attempt ${result.attestation.provenance.runAttempt}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = [
      renderMarkdownSummary(result.report), "", "### Release attestation", "",
      `- Verdict: \`${result.attestation.verdict}\``,
      `- Checked at: \`${result.attestation.checkedAt}\``,
      `- Policy: \`${result.attestation.policy.id}\``,
      `- Policy SHA-256: \`${result.attestation.policy.sha256}\``,
      `- Artifact: \`${attestationPath}\``,
      `- SHA-256: \`${result.writtenAttestation.checksum}\``,
      `- Provenance: ${result.attestation.provenance.runUrl}`,
      `- Run attempt: \`${result.attestation.provenance.runAttempt}\``, "",
    ].join("\n");
    await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { encoding: "utf8", flag: "a" });
  }
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });