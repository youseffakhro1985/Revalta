import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateReleaseTarget } from "./validate-release-target.mjs";
import { renderMarkdownSummary, runReleaseBoundarySmoke } from "./verify-release-boundaries.mjs";

const ATTESTATION_VERSION = 1;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function buildReleaseAttestation({ target, report, checkedAt = new Date() }) {
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
    boundaries: report.results.map((result) => ({
      name: result.label,
      httpStatus: result.status,
      durationMs: result.durationMs,
      redirectLocation: result.location ?? null,
    })),
  };
}

export async function writeReleaseAttestation(path, attestation) {
  const outputPath = resolve(path);
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(attestation, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, outputPath);
  return outputPath;
}

export async function runStrictReleaseGate(input, dependencies = {}) {
  const target = validateReleaseTarget(input);
  const report = await runReleaseBoundarySmoke({
    baseUrl: target.baseUrl,
    expectedSha: target.expectedSha,
    expectedEnvironment: target.environment,
    expectedBranch: target.branch,
  }, dependencies);

  const attestation = buildReleaseAttestation({
    target,
    report,
    checkedAt: dependencies.checkedAt,
  });

  if (dependencies.attestationPath) {
    await writeReleaseAttestation(dependencies.attestationPath, attestation);
  }

  return { target, report, attestation };
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
  console.log(`Release attestation written to ${resolve(attestationPath)}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = [
      renderMarkdownSummary(result.report),
      "",
      "### Release attestation",
      "",
      `- Verdict: \`${result.attestation.verdict}\``,
      `- Checked at: \`${result.attestation.checkedAt}\``,
      `- Artifact: \`${attestationPath}\``,
      "",
    ].join("\n");
    await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { encoding: "utf8", flag: "a" });
  }
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
