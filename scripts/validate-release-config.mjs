import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const paths = {
  vercel: new URL("vercel.json", root),
  package: new URL("package.json", root),
  vercelBuild: new URL("scripts/vercel-build.mjs", root),
  ci: new URL(".github/workflows/ci.yml", root),
  codeql: new URL(".github/workflows/codeql.yml", root),
  cronSmoke: new URL(".github/workflows/cron-smoke.yml", root),
  databaseRelease: new URL(".github/workflows/database-release.yml", root),
  databaseStatus: new URL(".github/workflows/database-status.yml", root),
  e2ePreview: new URL(".github/workflows/e2e-preview.yml", root),
};

const CHECKOUT_SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1"; // actions/checkout v7.0.1
const SETUP_NODE_SHA = "820762786026740c76f36085b0efc47a31fe5020"; // actions/setup-node v7.0.0
const CODEQL_SHA = "cdf488f595d80d6e07e03d4674febd5ab45fa938"; // github/codeql-action v4.37.9
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
    if (!ACTION_REFERENCE_PATTERN.test(line)) {
      fail(`${label} action references must use immutable 40-character commit SHAs: ${line.trim()}`);
    }
  }
}

function validateActionPins(source, label, { checkout = false, setupNode = false, codeql = false } = {}) {
  validatePinnedActions(source, label);
  if (checkout) {
    requireText(source, `uses: actions/checkout@${CHECKOUT_SHA}`, `${label} checkout action must use the verified commit`);
  }
  if (setupNode) {
    requireText(source, `uses: actions/setup-node@${SETUP_NODE_SHA}`, `${label} setup-node action must use the verified commit`);
  }
  if (codeql) {
    requireText(source, `uses: github/codeql-action/init@${CODEQL_SHA}`, `${label} CodeQL init must use the verified commit`);
    requireText(source, `uses: github/codeql-action/analyze@${CODEQL_SHA}`, `${label} CodeQL analyze must use the same verified commit`);
  }
}

const [
  vercel,
  packageJson,
  vercelBuild,
  ci,
  codeql,
  cronSmoke,
  databaseRelease,
  databaseStatus,
  e2ePreview,
] = await Promise.all([
  readJson(paths.vercel, "vercel.json"),
  readJson(paths.package, "package.json"),
  readFile(paths.vercelBuild, "utf8"),
  readFile(paths.ci, "utf8"),
  readFile(paths.codeql, "utf8"),
  readFile(paths.cronSmoke, "utf8"),
  readFile(paths.databaseRelease, "utf8"),
  readFile(paths.databaseStatus, "utf8"),
  readFile(paths.e2ePreview, "utf8"),
]);

if (vercel.framework !== "nextjs") fail("vercel.json framework must remain nextjs");
if (vercel.installCommand !== "npm ci") fail("vercel.json must install with npm ci");
if (vercel.buildCommand !== "npm run build") fail("vercel.json must build with npm run build");

requireText(
  vercelBuild,
  'process.env.RUN_DB_MIGRATIONS === "true"',
  "The application build must explicitly reject RUN_DB_MIGRATIONS=true",
);
requireText(
  vercelBuild,
  "Apply production migrations only through the protected Database Release workflow.",
  "The application build must direct migrations to the protected Database Release workflow",
);
requireOrder(
  vercelBuild,
  'process.env.RUN_DB_MIGRATIONS === "true"',
  'run("npx", ["prisma", "generate"])',
  "The migration guard must run before Prisma generation and the application build",
);
if (vercelBuild.includes('["prisma", "migrate", "deploy"]') || vercelBuild.includes("prisma migrate deploy")) {
  fail("The application build must never execute prisma migrate deploy");
}

if (!Array.isArray(vercel.crons) || vercel.crons.length === 0) fail("vercel.json must define scheduled operational jobs");
const cronPaths = vercel.crons.map((entry) => entry?.path);
if (cronPaths.some((path) => typeof path !== "string" || !path.startsWith("/api/cron/"))) fail("Every Vercel cron must target /api/cron/*");
if (new Set(cronPaths).size !== cronPaths.length) fail("Vercel cron paths must be unique");
if (vercel.crons.some((entry) => typeof entry?.schedule !== "string" || entry.schedule.trim().split(/\s+/).length !== 5)) {
  fail("Every Vercel cron must use a five-field schedule");
}

for (const [fragment, message] of [
  ["name: Revalta CI", "CI workflow name changed unexpectedly"],
  ["pull_request:", "CI must run for pull requests"],
  ["- main", "CI must protect main"],
  ["- release-preview", "CI must protect release-preview"],
  ["workflow_dispatch:", "CI must support controlled manual execution"],
  ["contents: read", "CI permissions must remain read-only"],
  ["persist-credentials: false", "CI checkout must not persist credentials"],
  [`image: postgres:16-alpine@${POSTGRES_DIGEST}`, "CI PostgreSQL service must use the verified immutable digest"],
  ["run: npm ci", "CI must use reproducible dependency installation"],
  ["run: npm run validate:release-config", "CI must validate release configuration"],
  ["run: npx prisma migrate deploy", "CI must apply migrations to a clean database"],
  ["run: npm run audit:ui-interactions", "CI must reject inert buttons and invalid navigation links"],
  ["run: npm run audit:dashboard-integrity", "CI must reject broken dashboard routes and legacy UI duplication"],
  ["run: npm run test:ci", "CI must run the complete test suite"],
  ["run: npm run typecheck", "CI must run TypeScript validation"],
  ["run: npm run audit:prod", "CI must audit production dependencies"],
  ["run: npm run build:ci", "CI must build the production application"],
]) requireText(ci, fragment, message);
requireOrder(ci, "run: npm run validate:release-config", "run: npx prisma generate", "Release configuration validation must run before Prisma and build work");
requireOrder(ci, "run: npm run audit:ui-interactions", "run: npm run audit:dashboard-integrity", "Dashboard integrity audit must follow the UI interaction audit");
validateActionPins(ci, "Revalta CI", { checkout: true, setupNode: true });

for (const [fragment, message] of [
  ["name: CodeQL", "CodeQL workflow name changed unexpectedly"],
  ["pull_request:", "CodeQL must run for pull requests"],
  ["- main", "CodeQL must protect main"],
  ["- release-preview", "CodeQL must protect release-preview"],
  ["workflow_dispatch:", "CodeQL must support controlled manual execution"],
  ["security-events: write", "CodeQL must be able to publish security findings"],
  ["persist-credentials: false", "CodeQL checkout must not persist credentials"],
]) requireText(codeql, fragment, message);
validateActionPins(codeql, "CodeQL", { checkout: true, codeql: true });

for (const [fragment, message] of [
  ["name: Database Status", "Database Status workflow name changed unexpectedly"],
  ["workflow_dispatch:", "Database Status must be manual-only"],
  ["commit_sha:", "Database Status must require an exact commit SHA"],
  ["contents: read", "Database Status permissions must remain read-only"],
  ["group: revalta-production-database-release", "Database Status must share the production migration concurrency lock"],
  ["environment: Production", "Database Status must use the Production environment"],
  ["persist-credentials: false", "Database Status checkout must not persist credentials"],
  ["git merge-base --is-ancestor", "Database Status must reject commits not contained in main"],
  ["run: npm ci", "Database Status must use reproducible dependency installation"],
  ["run: npx prisma generate", "Database Status must generate the Prisma client before inspection"],
  ["npx prisma migrate status", "Database Status must inspect migration status"],
  ["Read-only production schema inspection. This workflow must never apply migrations.", "Database Status must declare its read-only invariant"],
]) requireText(databaseStatus, fragment, message);
if (databaseStatus.includes("prisma migrate deploy") || databaseStatus.includes("prisma db push")) {
  fail("Database Status must never contain a mutating Prisma migration command");
}
requireOrder(databaseStatus, "git merge-base --is-ancestor", "npx prisma migrate status", "Database Status must verify the approved main commit before inspecting Production");
validateActionPins(databaseStatus, "Database Status", { checkout: true, setupNode: true });

validateActionPins(cronSmoke, "Cron Smoke", { checkout: true, setupNode: true });
validateActionPins(databaseRelease, "Database Release", { checkout: true, setupNode: true });
validateActionPins(e2ePreview, "Preview Browser E2E", { checkout: true, setupNode: true });

const scripts = packageJson?.scripts ?? {};
if (scripts["validate:release-config"] !== "node scripts/validate-release-config.mjs") fail("package.json must expose validate:release-config");
if (scripts["audit:ui-interactions"] !== "node scripts/audit-ui-interactions.mjs") fail("package.json must expose audit:ui-interactions");
if (scripts["audit:dashboard-integrity"] !== "node scripts/audit-dashboard-integrity.mjs") fail("package.json must expose audit:dashboard-integrity");
if (typeof scripts.quality !== "string" || !scripts.quality.startsWith("npm run validate:release-config &&")) fail("The quality command must validate release configuration first");
if (!scripts.quality.includes("npm run audit:ui-interactions")) fail("The quality command must audit UI interactions");
if (!scripts.quality.includes("npm run audit:dashboard-integrity")) fail("The quality command must audit dashboard route integrity");

console.log("Release configuration is valid: Vercel builds cannot run database migrations; Database Status is read-only and shares the production migration lock; Vercel commands and cron contracts, main/release-preview CI coverage, immutable verified GitHub Action pins across all release workflows, digest-pinned PostgreSQL, least-privilege checkout, clean-database migration checks, UI and dashboard integrity audits, tests, typechecking, dependency audit, production build and CodeQL enforcement are present");