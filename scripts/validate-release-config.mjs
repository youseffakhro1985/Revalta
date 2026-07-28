import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const paths = {
  vercel: new URL("vercel.json", root),
  package: new URL("package.json", root),
  ci: new URL(".github/workflows/ci.yml", root),
  codeql: new URL(".github/workflows/codeql.yml", root),
};

const CHECKOUT_SHA = "11d5960a326750d5838078e36cf38b85af677262";
const SETUP_NODE_SHA = "49933ea5288caeca8642d1e84afbd3f7d6820020";
const CODEQL_SHA = "4187e74d05793876e9989daffde9c3e66b4acd07";
const POSTGRES_DIGEST = "sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777";
const ACTION_REFERENCE_PATTERN = /^\s*uses:\s+([^\s@]+)@([0-9a-f]{40})(?:\s+#\s*.+)?\s*$/gm;

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function readJson(path, label) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    fail(`${label} could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requireText(source, fragment, message) {
  if (!source.includes(fragment)) fail(message);
}

function requireOrder(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) fail(message);
}

function validatePinnedActions(source, label) {
  const usesLines = source.split("\n").filter((line) => /^\s*uses:/.test(line));
  if (usesLines.length === 0) fail(`${label} must use at least one external action`);
  for (const line of usesLines) {
    ACTION_REFERENCE_PATTERN.lastIndex = 0;
    if (!ACTION_REFERENCE_PATTERN.test(line)) fail(`${label} action references must use immutable 40-character commit SHAs: ${line.trim()}`);
  }
}

const [vercel, packageJson, ci, codeql] = await Promise.all([
  readJson(paths.vercel, "vercel.json"),
  readJson(paths.package, "package.json"),
  readFile(paths.ci, "utf8"),
  readFile(paths.codeql, "utf8"),
]);

if (vercel.framework !== "nextjs") fail("vercel.json framework must remain nextjs");
if (vercel.installCommand !== "npm ci") fail("vercel.json must install with npm ci");
if (vercel.buildCommand !== "npm run build") fail("vercel.json must build with npm run build");

if (!Array.isArray(vercel.crons) || vercel.crons.length === 0) fail("vercel.json must define scheduled operational jobs");
const cronPaths = vercel.crons.map((entry) => entry?.path);
if (cronPaths.some((path) => typeof path !== "string" || !path.startsWith("/api/cron/"))) fail("Every Vercel cron must target /api/cron/*");
if (new Set(cronPaths).size !== cronPaths.length) fail("Vercel cron paths must be unique");
if (vercel.crons.some((entry) => typeof entry?.schedule !== "string" || entry.schedule.trim().split(/\s+/).length !== 5)) fail("Every Vercel cron must use a five-field schedule");

for (const [fragment, message] of [
  ["name: Revalta CI", "CI workflow name changed unexpectedly"],
  ["pull_request:", "CI must run for pull requests"],
  ["- main", "CI must protect main"],
  ["- release-preview", "CI must protect release-preview"],
  ["workflow_dispatch:", "CI must support controlled manual execution"],
  ["contents: read", "CI permissions must remain read-only"],
  ["persist-credentials: false", "CI checkout must not persist credentials"],
  [`image: postgres:16-alpine@${POSTGRES_DIGEST}`, "CI PostgreSQL service must use the verified immutable digest"],
  [`uses: actions/checkout@${CHECKOUT_SHA} # v4`, "CI checkout action must use the verified commit"],
  [`uses: actions/setup-node@${SETUP_NODE_SHA} # v4`, "CI setup-node action must use the verified commit"],
  ["run: npm ci", "CI must use reproducible dependency installation"],
  ["run: npm run validate:release-config", "CI must validate release configuration"],
  ["run: npx prisma migrate deploy", "CI must apply migrations to a clean database"],
  ["run: npm run test:ci", "CI must run the complete test suite"],
  ["run: npm run typecheck", "CI must run TypeScript validation"],
  ["run: npm run audit:prod", "CI must audit production dependencies"],
  ["run: npm run build:ci", "CI must build the production application"],
]) requireText(ci, fragment, message);
requireOrder(ci, "run: npm run validate:release-config", "run: npx prisma generate", "Release configuration validation must run before Prisma and build work");
validatePinnedActions(ci, "Revalta CI");

for (const [fragment, message] of [
  ["name: CodeQL", "CodeQL workflow name changed unexpectedly"],
  ["pull_request:", "CodeQL must run for pull requests"],
  ["- main", "CodeQL must protect main"],
  ["- release-preview", "CodeQL must protect release-preview"],
  ["workflow_dispatch:", "CodeQL must support controlled manual execution"],
  ["security-events: write", "CodeQL must be able to publish security findings"],
  ["persist-credentials: false", "CodeQL checkout must not persist credentials"],
  [`uses: actions/checkout@${CHECKOUT_SHA} # v4`, "CodeQL checkout action must use the verified commit"],
  [`uses: github/codeql-action/init@${CODEQL_SHA} # v3`, "CodeQL initialization must use the verified commit"],
  [`uses: github/codeql-action/analyze@${CODEQL_SHA} # v3`, "CodeQL analysis must use the verified commit"],
]) requireText(codeql, fragment, message);
validatePinnedActions(codeql, "CodeQL");

const scripts = packageJson?.scripts ?? {};
if (scripts["validate:release-config"] !== "node scripts/validate-release-config.mjs") fail("package.json must expose validate:release-config");
if (typeof scripts.quality !== "string" || !scripts.quality.startsWith("npm run validate:release-config &&")) fail("The quality command must validate release configuration first");

console.log("Release configuration is valid: Vercel commands and cron contracts, main/release-preview CI coverage, immutable GitHub Action pins, digest-pinned PostgreSQL, least-privilege checkout, database migration checks, tests, typechecking, dependency audit, production build and CodeQL enforcement are present");
