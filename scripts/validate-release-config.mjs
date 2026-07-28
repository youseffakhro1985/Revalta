import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const paths = {
  vercel: new URL("vercel.json", root), package: new URL("package.json", root),
  strictWorkflow: new URL(".github/workflows/strict-release-boundary-gate.yml", root),
  legacyWorkflow: new URL(".github/workflows/release-boundary-smoke.yml", root),
  targetValidator: new URL("scripts/validate-release-target.mjs", root),
  boundaryVerifier: new URL("scripts/verify-release-boundaries.mjs", root),
  strictGateRunner: new URL("scripts/run-strict-release-gate.mjs", root),
  attestationVerifier: new URL("scripts/verify-release-attestation.mjs", root),
  canonicalVerifier: new URL("scripts/verify-canonical-release-attestation.mjs", root),
};
function fail(message) { console.error(message); process.exit(1); }
async function readJson(path, label) { let raw; try { raw = await readFile(path, "utf8"); } catch (error) { fail(`${label} could not be read: ${error instanceof Error ? error.message : String(error)}`); } try { return JSON.parse(raw); } catch (error) { fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); } }
async function assertFileExists(path, label) { try { await access(path); } catch { fail(`${label} is required by the controlled release contract`); } }
async function assertFileMissing(path, label) { try { await access(path); fail(`${label} must not exist because Strict Release Boundary Gate is the only authoritative release workflow`); } catch (error) { if (error?.code !== "ENOENT") throw error; } }
function requireText(source, fragment, message) { if (!source.includes(fragment)) fail(message); }

const config = await readJson(paths.vercel, "vercel.json");
const packageJson = await readJson(paths.package, "package.json");
const deploymentEnabled = config?.git?.deploymentEnabled;
if (!deploymentEnabled || typeof deploymentEnabled !== "object" || Array.isArray(deploymentEnabled)) fail("vercel.json must define git.deploymentEnabled as an explicit branch map");
const enabledBranches = Object.entries(deploymentEnabled).filter(([, enabled]) => enabled === true).map(([branch]) => branch).sort();
const expectedBranches = ["main", "release-preview"];
if (JSON.stringify(enabledBranches) !== JSON.stringify(expectedBranches)) fail(`Automatic Vercel deployments must be limited to ${expectedBranches.join(", ")}; received ${enabledBranches.join(", ") || "none"}`);
if (Object.hasOwn(deploymentEnabled, "*")) fail("Wildcard Vercel deployment rules are not allowed");
if (config.framework !== "nextjs" || config.buildCommand !== "npm run build" || config.installCommand !== "npm ci") fail("Vercel install/build contract changed unexpectedly");

await assertFileExists(paths.targetValidator, "Release target validator");
await assertFileExists(paths.boundaryVerifier, "Release boundary verifier");
await assertFileExists(paths.strictGateRunner, "Strict release gate runner");
await assertFileExists(paths.attestationVerifier, "Release attestation verifier");
await assertFileExists(paths.canonicalVerifier, "Canonical release attestation verifier");
await assertFileExists(paths.strictWorkflow, "Strict Release Boundary Gate workflow");
await assertFileMissing(paths.legacyWorkflow, "Legacy Release Boundary Smoke workflow");

const workflow = await readFile(paths.strictWorkflow, "utf8");
for (const [fragment, message] of [
  ["name: Strict Release Boundary Gate", "Strict release workflow name changed unexpectedly"],
  ["workflow_dispatch:", "Strict release workflow must remain explicitly dispatched"],
  ["ref: ${{ inputs.expected_sha }}", "Strict release workflow must check out the exact SHA"],
  ["persist-credentials: false", "Strict release workflow must not persist credentials"],
  ["node scripts/run-strict-release-gate.mjs", "Strict release workflow must run the strict gate"],
  ["uses: actions/upload-artifact@v4", "Strict release workflow must persist evidence"],
  ["artifacts/release-boundary-attestation.json.sha256", "Release artifact must include its checksum"],
  ["if-no-files-found: error", "Missing release evidence must fail"],
  ["retention-days: 30", "Release evidence must retain the 30-day audit window"],
  ["contents: read", "Strict release workflow must remain least privilege"],
  ["cancel-in-progress: false", "Release evidence runs must not cancel each other"],
]) requireText(workflow, fragment, message);

const runner = await readFile(paths.strictGateRunner, "utf8");
for (const [fragment, message] of [
  ["const ATTESTATION_VERSION = 6", "Strict release runner must emit schema version 6"],
  ['const RELEASE_POLICY_ID = "revalta.strict-release-policy.v1"', "Strict release runner must retain the policy ID"],
  ["objectShapeContract: \"exact-keys-no-extensions\"", "Canonical policy must bind exact object shapes"],
  ["export function assertExactKeys", "Strict release runner must centralize exact-key validation"],
  ["validateCanonicalAttestationShape", "Strict release runner must validate the complete attestation shape"],
  ['assertExactKeys(attestation, ["schemaVersion", "kind", "verdict", "checkedAt", "policy", "release", "provenance", "boundaries"], "Release attestation")', "Strict release runner must reject top-level extensions"],
  ['assertExactKeys(attestation.release, ["commitSha", "shortCommitSha", "environment", "branch", "origin"], "Release metadata")', "Strict release runner must validate release metadata shape"],
  ['assertExactKeys(attestation.provenance, ["repository", "workflow", "workflowRef", "runId", "runAttempt", "serverUrl", "runUrl"], "Release provenance")', "Strict release runner must validate provenance shape"],
  ['assertExactKeys(boundary.transport, ["attempts", "retryStatuses", "networkErrors", "totalBackoffMs"], `${boundary.name} transport evidence`)', "Strict release runner must validate transport shape"],
  ["validateCanonicalAttestationShape(attestation)", "Serialization must validate shape before writing"],
  ["calculateReleasePolicyDigest", "Strict release runner must calculate the policy digest"],
  ["policy: buildReleasePolicyEvidence()", "Strict release runner must persist policy evidence"],
  ["BOUNDARY_REQUESTS", "Strict release runner must bind endpoint identity"],
  ["dashboard-boundary: redirect escaped release origin", "Strict release runner must reject escaped redirects"],
  ["mode: 0o600", "Release evidence files must remain private"],
]) requireText(runner, fragment, message);

const boundary = await readFile(paths.boundaryVerifier, "utf8");
for (const [fragment, message] of [
  ["validateContentType(response.headers, \"text/html\", \"public-home\")", "Public boundary must enforce HTML"],
  ["validateContentType(response.headers, \"application/json\", \"health-api\")", "Health boundary must enforce JSON"],
  ["login redirect must not contain a query string", "Dashboard redirects must reject queries"],
  ["destination.origin === baseUrl.origin", "Dashboard redirects must remain same-origin"],
  ["const MAX_HEALTH_BODY_BYTES = 32 * 1024", "Health body size must remain bounded"],
  ["RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])", "Retry allowlist changed"],
  ["from \"node:perf_hooks\"", "Release smoke must use a monotonic clock"],
  ["Monotonic release clock moved backwards", "Release smoke must fail on backwards time"],
  ['{ label: "health-api", path: "/api/health" }', "Health route contract changed"],
  ['{ method: "GET" }', "Release smoke must retain GET requests"],
]) requireText(boundary, fragment, message);

const verifier = await readFile(paths.attestationVerifier, "utf8");
for (const [fragment, message] of [
  ["const ATTESTATION_VERSION = 6", "Release verifier must require schema version 6"],
  ["const MAX_CHECKSUM_BYTES = 256", "Checksum sidecars must retain the 256-byte ceiling"],
  ["export function parseCanonicalChecksumBytes", "Release verifier must canonicalize checksum sidecars"],
  ["canonical lowercase '<sha256>  <filename>\\n' bytes", "Checksum sidecars must use lowercase LF-only canonical bytes"],
  ["Checksum file must not contain a UTF-8 BOM", "Checksum sidecars must reject BOM prefixes"],
  ["export function verifyReleaseAttestationSnapshot", "Release verifier must expose immutable snapshot verification"],
  ["const immutableAttestationBytes = Buffer.from(attestationBytes)", "Snapshot verification must copy attestation bytes"],
  ["const immutableChecksumBytes = Buffer.from(checksumBytes ?? [])", "Snapshot verification must copy checksum bytes"],
  ["parseCanonicalChecksumBytes(immutableChecksumBytes", "Snapshot verification must validate the captured sidecar"],
  ["verifyChecksum(immutableAttestationBytes", "Snapshot verification must hash the captured artifact"],
  ["Promise.all([readFile(resolvedAttestationPath), readFile(resolvedChecksumPath)])", "File verification must read both evidence files once"],
  ["objectShapeContract: \"exact-keys-no-extensions\"", "Verifier policy must bind exact shapes"],
  ["export function assertExactKeys", "Verifier must centralize exact-key validation"],
  ["validateCanonicalAttestationShape(attestation)", "Verifier must validate the complete shape first"],
  ["validateReleasePolicyEvidence", "Verifier must validate policy evidence"],
  ["Release policy SHA-256 mismatch", "Verifier must reject policy digest mismatch"],
  ["timingSafeEqual(actual, expected)", "Verifier must compare digests timing-safely"],
  ["validateBoundaryRequest", "Verifier must validate endpoint identity"],
  ["validateBoundaryOutcome", "Verifier must validate final outcomes"],
  ["durationMs cannot be shorter than totalBackoffMs", "Verifier must reject impossible timing"],
  ["MAX_ATTESTATION_AGE_SECONDS", "Verifier must support replay-age limits"],
]) requireText(verifier, fragment, message);

const canonicalVerifier = await readFile(paths.canonicalVerifier, "utf8");
for (const [fragment, message] of [
  ["const MAX_ATTESTATION_BYTES = 1024 * 1024", "Canonical verifier must retain the 1 MiB size ceiling"],
  ["new TextDecoder(\"utf-8\", { fatal: true", "Canonical verifier must reject invalid UTF-8"],
  ["must not contain a UTF-8 BOM", "Canonical verifier must reject BOM-prefixed artifacts"],
  ["CANONICAL_KEY_ORDER", "Canonical verifier must retain controlled recursive key order"],
  ["canonicalizeJsonValue", "Canonical verifier must recursively canonicalize parsed JSON"],
  ["text === canonical", "Canonical verifier must compare raw and canonical bytes exactly"],
  ["duplicate keys, alternate key order or non-canonical whitespace are forbidden", "Canonical verifier must reject parser-ambiguous JSON"],
  ["verifyReleaseAttestationSnapshot", "Canonical verifier must delegate to immutable snapshot verification"],
  ["Promise.all([", "Canonical verifier must capture artifact and sidecar together"],
  ["readFile(resolvedAttestationPath)", "Canonical verifier must read the artifact exactly once"],
  ["readFile(resolvedChecksumPath)", "Canonical verifier must read the sidecar exactly once"],
]) requireText(canonicalVerifier, fragment, message);
if (canonicalVerifier.includes("verifyReleaseAttestationFiles")) fail("Canonical verifier must not reopen evidence through the file-based verifier");

const scripts = packageJson?.scripts ?? {};
if (scripts["validate:release-config"] !== "node scripts/validate-release-config.mjs") fail("package.json must expose validate:release-config");
if (scripts["verify:release-attestation"] !== "node scripts/verify-canonical-release-attestation.mjs") fail("package.json must route release verification through canonical bytes");
if (scripts["smoke:release-boundaries"] !== "node scripts/verify-release-boundaries.mjs") fail("package.json must expose smoke:release-boundaries");
if (typeof scripts.quality !== "string" || !scripts.quality.startsWith("npm run validate:release-config &&")) fail("The quality command must run release configuration validation first");

console.log("Release configuration, immutable evidence snapshots, canonical checksum sidecars, schema-v6 exact object shapes, canonical JSON bytes, duplicate-key resistance, policy fingerprints, endpoint identity, boundary semantics, monotonic timing, transport telemetry, provenance, checksum-backed attestations, offline verification and replay protection are valid");