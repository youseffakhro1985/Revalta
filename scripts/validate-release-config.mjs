import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const paths = {
  vercel: new URL("vercel.json", root),
  package: new URL("package.json", root),
  strictWorkflow: new URL(".github/workflows/strict-release-boundary-gate.yml", root),
  legacyWorkflow: new URL(".github/workflows/release-boundary-smoke.yml", root),
  targetValidator: new URL("scripts/validate-release-target.mjs", root),
  boundaryVerifier: new URL("scripts/verify-release-boundaries.mjs", root),
  strictGateRunner: new URL("scripts/run-strict-release-gate.mjs", root),
  attestationVerifier: new URL("scripts/verify-release-attestation.mjs", root),
};

function fail(message) { console.error(message); process.exit(1); }
async function readJson(path, label) {
  let raw;
  try { raw = await readFile(path, "utf8"); }
  catch (error) { fail(`${label} could not be read: ${error instanceof Error ? error.message : String(error)}`); }
  try { return JSON.parse(raw); }
  catch (error) { fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
}
async function assertFileExists(path, label) { try { await access(path); } catch { fail(`${label} is required by the controlled release contract`); } }
async function assertFileMissing(path, label) {
  try { await access(path); fail(`${label} must not exist because Strict Release Boundary Gate is the only authoritative release workflow`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
function requireText(source, fragment, message) { if (!source.includes(fragment)) fail(message); }

const config = await readJson(paths.vercel, "vercel.json");
const packageJson = await readJson(paths.package, "package.json");
const deploymentEnabled = config?.git?.deploymentEnabled;
if (!deploymentEnabled || typeof deploymentEnabled !== "object" || Array.isArray(deploymentEnabled)) fail("vercel.json must define git.deploymentEnabled as an explicit branch map");
const enabledBranches = Object.entries(deploymentEnabled).filter(([, enabled]) => enabled === true).map(([branch]) => branch).sort();
const expectedBranches = ["main", "release-preview"];
if (JSON.stringify(enabledBranches) !== JSON.stringify(expectedBranches)) fail(`Automatic Vercel deployments must be limited to ${expectedBranches.join(", ")}; received ${enabledBranches.join(", ") || "none"}`);
if (Object.hasOwn(deploymentEnabled, "*")) fail("Wildcard Vercel deployment rules are not allowed");
if (config.framework !== "nextjs") fail("Vercel framework must remain nextjs");
if (config.buildCommand !== "npm run build" || config.installCommand !== "npm ci") fail("Vercel install/build commands differ from the controlled release contract");

await assertFileExists(paths.targetValidator, "Release target validator");
await assertFileExists(paths.boundaryVerifier, "Release boundary verifier");
await assertFileExists(paths.strictGateRunner, "Strict release gate runner");
await assertFileExists(paths.attestationVerifier, "Release attestation verifier");
await assertFileExists(paths.strictWorkflow, "Strict Release Boundary Gate workflow");
await assertFileMissing(paths.legacyWorkflow, "Legacy Release Boundary Smoke workflow");

const workflow = await readFile(paths.strictWorkflow, "utf8");
requireText(workflow, "name: Strict Release Boundary Gate", "Strict release workflow name changed unexpectedly");
requireText(workflow, "workflow_dispatch:", "Strict release workflow must remain manually and explicitly dispatched");
requireText(workflow, "ref: ${{ inputs.expected_sha }}", "Strict release workflow must check out the exact expected SHA");
requireText(workflow, "persist-credentials: false", "Strict release workflow must not persist GitHub credentials");
requireText(workflow, "node scripts/run-strict-release-gate.mjs", "Strict release workflow must run the attesting strict gate orchestrator");
requireText(workflow, "RELEASE_ATTESTATION_PATH: artifacts/release-boundary-attestation.json", "Strict release workflow must use the controlled attestation path");
requireText(workflow, "uses: actions/upload-artifact@v4", "Strict release workflow must persist release evidence as an artifact");
requireText(workflow, "name: release-boundary-${{ inputs.expected_environment }}-${{ inputs.expected_sha }}", "Release artifact name must bind environment and full SHA");
requireText(workflow, "artifacts/release-boundary-attestation.json.sha256", "Release artifact must include the SHA-256 checksum file");
requireText(workflow, "if-no-files-found: error", "Missing release evidence must fail the artifact step");
requireText(workflow, "if: always()", "Release artifact upload must run even when the gate fails");
requireText(workflow, "retention-days: 30", "Release evidence must retain the controlled 30-day audit window");
requireText(workflow, "contents: read", "Strict release workflow must retain least-privilege contents permissions");
requireText(workflow, "cancel-in-progress: false", "Release evidence runs must not cancel one another");

const runner = await readFile(paths.strictGateRunner, "utf8");
requireText(runner, "const ATTESTATION_VERSION = 5", "Strict release runner must emit schema version 5 attestations");
requireText(runner, 'const RELEASE_POLICY_ID = "revalta.strict-release-policy.v1"', "Strict release runner must retain the controlled release policy ID");
requireText(runner, "buildCanonicalReleasePolicy", "Strict release runner must define the canonical release policy");
requireText(runner, "calculateReleasePolicyDigest", "Strict release runner must calculate the release policy digest");
requireText(runner, 'createHash("sha256").update(JSON.stringify(policy)', "Strict release runner must hash the canonical policy deterministically");
requireText(runner, "policy: buildReleasePolicyEvidence()", "Strict release runner must persist policy evidence in the attestation");
requireText(runner, "BOUNDARY_REQUESTS", "Strict release runner must define the controlled endpoint identity map");
requireText(runner, '"public-home": Object.freeze({ method: "GET", path: "/" })', "Strict release runner must bind public-home to GET /");
requireText(runner, '"dashboard-boundary": Object.freeze({ method: "GET", path: "/dashboard" })', "Strict release runner must bind dashboard-boundary to GET /dashboard");
requireText(runner, '"health-api": Object.freeze({ method: "GET", path: "/api/health" })', "Strict release runner must bind health-api to GET /api/health");
requireText(runner, "request: { method: request.method, path: request.path }", "Strict release runner must persist endpoint identity in the attestation");
requireText(runner, "buildReleaseProvenance", "Strict release runner must collect GitHub Actions provenance");
requireText(runner, "GITHUB_WORKFLOW_REF", "Strict release runner must bind evidence to the workflow ref");
requireText(runner, "validateBoundaryTransport", "Strict release runner must validate transport evidence");
requireText(runner, "normalizeBoundaryOutcome", "Strict release runner must normalize boundary-specific outcomes");
requireText(runner, "public-home: passed attestation requires HTTP 200", "Strict release runner must require public-home HTTP 200");
requireText(runner, "health-api: passed attestation requires HTTP 200", "Strict release runner must require health-api HTTP 200");
requireText(runner, "dashboard-boundary: redirect escaped release origin", "Strict release runner must reject escaped dashboard redirects");
requireText(runner, "redirectLocation = \"/login\"", "Strict release runner must canonicalize dashboard redirects");
requireText(runner, "Attestation boundaries must be exactly", "Strict release runner must enforce the exact boundary set");
requireText(runner, "`${outputPath}.sha256`", "Strict release runner must write the controlled checksum path");
requireText(runner, "mode: 0o600", "Release evidence files must retain private filesystem permissions");

const boundary = await readFile(paths.boundaryVerifier, "utf8");
requireText(boundary, "validateContentType(response.headers, \"text/html\", \"public-home\")", "Public release boundary must enforce HTML content type");
requireText(boundary, "validateContentType(response.headers, \"application/json\", \"health-api\")", "Health release boundary must enforce JSON content type");
requireText(boundary, "login redirect must not contain a query string", "Dashboard release boundary must reject login redirect query strings");
requireText(boundary, "destination.origin === baseUrl.origin", "Dashboard release boundary must retain same-origin redirect enforcement");
requireText(boundary, "const MAX_HEALTH_BODY_BYTES = 32 * 1024", "Health release boundary must retain the controlled response-size ceiling");
requireText(boundary, "RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])", "Release smoke must retain the controlled transient HTTP retry allowlist");
requireText(boundary, "from \"node:perf_hooks\"", "Release smoke must use the Node monotonic performance clock");
requireText(boundary, "Monotonic release clock moved backwards", "Release smoke must fail closed on a backwards monotonic clock");
requireText(boundary, '{ label: "public-home", path: "/" }', "Release smoke must retain the controlled public-home route");
requireText(boundary, '{ label: "dashboard-boundary", path: "/dashboard" }', "Release smoke must retain the controlled dashboard route");
requireText(boundary, '{ label: "health-api", path: "/api/health" }', "Release smoke must retain the controlled health route");
requireText(boundary, '{ method: "GET" }', "Release smoke must retain GET requests for controlled boundaries");

const verifier = await readFile(paths.attestationVerifier, "utf8");
requireText(verifier, "const ATTESTATION_VERSION = 5", "Release verifier must require schema version 5");
requireText(verifier, 'const RELEASE_POLICY_ID = "revalta.strict-release-policy.v1"', "Release verifier must bind evidence to the controlled policy ID");
requireText(verifier, "buildCanonicalReleasePolicy", "Release verifier must independently define the canonical release policy");
requireText(verifier, "validateReleasePolicyEvidence", "Release verifier must validate policy evidence");
requireText(verifier, "Release policy evidence must contain only id and sha256", "Release verifier must reject ambiguous policy evidence");
requireText(verifier, "Release policy SHA-256 mismatch", "Release verifier must reject policy digest mismatches");
requireText(verifier, "timingSafeEqual(actual, expected)", "Release verifier must compare policy and artifact digests timing-safely");
requireText(verifier, "BOUNDARY_REQUESTS", "Release verifier must define the controlled endpoint identity map");
requireText(verifier, "validateBoundaryRequest", "Release verifier must validate endpoint identity");
requireText(verifier, "request evidence must contain only method and path", "Release verifier must reject extra request evidence fields");
requireText(verifier, "EXPECTED_REPOSITORY = \"youseffakhro1985/Revalta\"", "Release verifier must bind evidence to the controlled repository");
requireText(verifier, "EXPECTED_WORKFLOW = \"Strict Release Boundary Gate\"", "Release verifier must bind evidence to the controlled workflow");
requireText(verifier, "validateBoundaryTransport", "Release verifier must validate boundary transport evidence");
requireText(verifier, "validateBoundaryOutcome", "Release verifier must validate boundary-specific final outcomes");
requireText(verifier, "durationMs cannot be shorter than totalBackoffMs", "Release verifier must reject temporally impossible evidence");
requireText(verifier, "CANONICAL_ISO_PATTERN", "Release attestation verifier must require canonical UTC timestamps");
requireText(verifier, "MAX_ATTESTATION_AGE_SECONDS", "Release attestation verifier must support explicit replay-age limits");

const scripts = packageJson?.scripts ?? {};
if (scripts["validate:release-config"] !== "node scripts/validate-release-config.mjs") fail("package.json must expose the controlled validate:release-config command");
if (scripts["verify:release-attestation"] !== "node scripts/verify-release-attestation.mjs") fail("package.json must expose the controlled verify:release-attestation command");
if (scripts["smoke:release-boundaries"] !== "node scripts/verify-release-boundaries.mjs") fail("package.json must expose the controlled smoke:release-boundaries command");
if (typeof scripts.quality !== "string" || !scripts.quality.startsWith("npm run validate:release-config &&")) fail("The quality command must run release configuration validation before all other checks");

console.log("Release configuration, schema-v5 policy fingerprints, endpoint identity, exact boundary semantics, canonical redirects, monotonic timing, transport telemetry, bounded HTTP retries, provenance, checksum-backed attestations, offline verification and replay protection are valid");