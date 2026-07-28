import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateReleaseTarget } from "./validate-release-target.mjs";
import { renderMarkdownSummary, runReleaseBoundarySmoke } from "./verify-release-boundaries.mjs";

const ATTESTATION_VERSION = 2;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
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

export function buildReleaseAttestation({ target, report, provenance, checkedAt = new Date() }) {
  invariant(target && report, "Target and boundary report are required");
  invariant(report.release === target.expectedSha, "Attestation release SHA mismatch");
  invariant(report.environment === target.environment, "Attestation environment mismatch");
  invariant(report.branch === target.branch, "Attestation branch mismatch");
  invariant(report.baseUrl === target.baseUrl, "Attestation base URL mismatch");

  return {
    schemaVersion: ATTESTATION_VERSION,
    kind: "revalta.release-boundary-attestation",
    verdict: "passed",
    checkedAt: checkedAt.toISOString(),
    release: {
      commitSha: target.expectedSha,
      shortCommitSha: target.expectedSha.slice(0, 7),
      environment: target.environment,
      branch: target.branch,
      origin: target.baseUrl,
    },
    provenance: validateReleaseProvenance(provenance),
    boundaries: report.results.map((result) => ({
      name: result.label,
      httpStatus: result.status,
      durationMs: result.durationMs,
      redirectLocation: result.location ?? null,
    })),
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
  const attestation = buildReleaseAttestation({
    target,
    report,
    provenance,
    checkedAt: dependencies.checkedAt,
  });

  let writtenAttestation = null;
  if (dependencies.attestationPath) {
    writtenAttestation = await writeReleaseAttestation(dependencies.attestationPath, attestation);
  }

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
  console.log(`Release provenance: ${result.attestation.provenance.runUrl} attempt ${result.attestation.provenance.runAttempt}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = [
      renderMarkdownSummary(result.report),
      "",
      "### Release attestation",
      "",
      `- Verdict: \`${result.attestation.verdict}\``,
      `- Checked at: \`${result.attestation.checkedAt}\``,
      `- Artifact: \`${attestationPath}\``,
      `- SHA-256: \`${result.writtenAttestation.checksum}\``,
      `- Provenance: ${result.attestation.provenance.runUrl}`,
      `- Run attempt: \`${result.attestation.provenance.runAttempt}\``,
      "",
    ].join("\n");
    await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { encoding: "utf8", flag: "a" });
  }
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
