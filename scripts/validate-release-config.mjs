import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const paths = {
  vercel: new URL("vercel.json", root),
  package: new URL("package.json", root),
  ci: new URL(".github/workflows/ci.yml", root),
  codeql: new URL(".github/workflows/codeql.yml", root),
};

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
  ["run: npm ci", "CI must use reproducible dependency installation"],
  ["run: npm run validate:release-config", "CI must validate release configuration"],
  ["run: npx prisma migrate deploy", "CI must apply migrations to a clean database"],
  ["run: npm run test:ci", "CI must run the complete test suite"],
  ["run: npm run typecheck", "CI must run TypeScript validation"],
  ["run: npm run audit:prod", "CI must audit production dependencies"],
  ["run: npm run build:ci", "CI must build the production application"],
]) requireText(ci, fragment, message);
requireOrder(ci, "run: npm run validate:release-config", "run: npx prisma generate", "Release configuration validation must run before Prisma and build work");

for (const [fragment, message] of [
  ["name: CodeQL", "CodeQL workflow name changed unexpectedly"],
  ["pull_request:", "CodeQL must run for pull requests"],
  ["- main", "CodeQL must protect main"],
  ["- release-preview", "CodeQL must protect release-preview"],
  ["workflow_dispatch:", "CodeQL must support controlled manual execution"],
  ["security-events: write", "CodeQL must be able to publish security findings"],
  ["persist-credentials: false", "CodeQL checkout must not persist credentials"],
  ["github/codeql-action/init@v3", "CodeQL initialization must remain enabled"],
  ["github/codeql-action/analyze@v3", "CodeQL analysis must remain enabled"],
]) requireText(codeql, fragment, message);

const scripts = packageJson?.scripts ?? {};
if (scripts["validate:release-config"] !== "node scripts/validate-release-config.mjs") fail("package.json must expose validate:release-config");
if (typeof scripts.quality !== "string" || !scripts.quality.startsWith("npm run validate:release-config &&")) fail("The quality command must validate release configuration first");

console.log("Release configuration is valid: Vercel commands and cron contracts, main/release-preview CI coverage, least-privilege checkout, database migration checks, tests, typechecking, dependency audit, production build and CodeQL enforcement are present");
