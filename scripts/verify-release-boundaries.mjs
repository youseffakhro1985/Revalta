import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRY_DELAY_MS = 1_500;
const MAX_HEALTH_BODY_BYTES = 32 * 1024;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizedBaseUrl(value) {
  const url = new URL(value);
  invariant(url.protocol === "https:", "BASE_URL must use HTTPS");
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

export function validateOptions(options) {
  invariant(options && typeof options === "object", "Release smoke options are required");
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const expectedSha = String(options.expectedSha ?? "").trim().toLowerCase();
  const expectedEnvironment = String(options.expectedEnvironment ?? "").trim();
  const expectedBranch = String(options.expectedBranch ?? "").trim();

  invariant(SHA_PATTERN.test(expectedSha), "EXPECTED_SHA must be a full 40-character Git commit SHA");
  invariant(["preview", "production"].includes(expectedEnvironment), "EXPECTED_ENVIRONMENT must be preview or production");
  invariant(expectedBranch.length > 0, "EXPECTED_BRANCH is required");
  if (expectedEnvironment === "production") {
    invariant(expectedBranch === "main", "Production smoke must target branch main");
  }

  return { baseUrl, expectedSha, expectedEnvironment, expectedBranch };
}

function validateContentType(headers, expected, label) {
  const value = (headers.get("content-type") ?? "").toLowerCase();
  invariant(value.split(";", 1)[0].trim() === expected, `${label}: expected Content-Type ${expected}`);
}

function validateSecurityHeaders(headers, label) {
  const required = new Map([
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "DENY"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
  ]);
  for (const [name, expected] of required) {
    invariant(headers.get(name) === expected, `${label}: expected ${name}=${expected}`);
  }

  const csp = headers.get("content-security-policy") ?? "";
  invariant(csp.includes("default-src 'self'"), `${label}: CSP is missing default-src 'self'`);
  invariant(csp.includes("object-src 'none'"), `${label}: CSP is missing object-src 'none'`);
  invariant(csp.includes("frame-ancestors 'none'"), `${label}: CSP is missing frame-ancestors 'none'`);
}

function validatePrivateNoStore(headers, label) {
  const value = (headers.get("cache-control") ?? "").toLowerCase();
  for (const directive of ["private", "no-store", "max-age=0", "must-revalidate"]) {
    invariant(value.includes(directive), `${label}: Cache-Control is missing ${directive}`);
  }
  invariant((headers.get("cdn-cache-control") ?? "").toLowerCase().includes("no-store"), `${label}: CDN-Cache-Control must be no-store`);
  invariant((headers.get("vercel-cdn-cache-control") ?? "").toLowerCase().includes("no-store"), `${label}: Vercel-CDN-Cache-Control must be no-store`);
}

export function validateHomeBoundary(response, expectedEnvironment) {
  invariant(response.status === 200, `public-home: expected HTTP 200, received ${response.status}`);
  validateContentType(response.headers, "text/html", "public-home");
  validateSecurityHeaders(response.headers, "public-home");
  const robots = (response.headers.get("x-robots-tag") ?? "").toLowerCase();
  if (expectedEnvironment === "production") {
    invariant(!robots.includes("noindex"), "public-home: production must not emit noindex");
  } else {
    invariant(robots.includes("noindex"), "public-home: preview must emit noindex");
  }
}

export function validateDashboardBoundary(response, baseUrl) {
  const redirects = new Set([301, 302, 303, 307, 308]);
  const denials = new Set([401, 403]);
  invariant(redirects.has(response.status) || denials.has(response.status), `dashboard-boundary: expected redirect/401/403, received ${response.status}`);
  validateSecurityHeaders(response.headers, "dashboard-boundary");
  validatePrivateNoStore(response.headers, "dashboard-boundary");

  if (redirects.has(response.status)) {
    const location = response.headers.get("location");
    invariant(location, "dashboard-boundary: redirect is missing Location");
    const destination = new URL(location, baseUrl);
    invariant(destination.origin === baseUrl.origin, `dashboard-boundary: redirect escaped origin to ${destination.origin}`);
    invariant(destination.pathname === "/login", `dashboard-boundary: expected /login, received ${destination.pathname}`);
    invariant(destination.search === "", "dashboard-boundary: login redirect must not contain a query string");
    invariant(destination.hash === "", "dashboard-boundary: login redirect must not contain a fragment");
  }
}

export function validateHealthBoundary(response, payload, expected) {
  invariant(response.status === 200, `health-api: expected HTTP 200, received ${response.status}`);
  validateContentType(response.headers, "application/json", "health-api");
  validateSecurityHeaders(response.headers, "health-api");
  invariant(payload?.ok === true && payload?.status === "ok" && payload?.database === "ok", "health-api: service or database is not healthy");
  invariant(payload?.release?.commitSha?.toLowerCase() === expected.expectedSha, "health-api: deployed commit SHA does not match release candidate");
  invariant(payload?.release?.shortCommitSha === expected.expectedSha.slice(0, 7), "health-api: short commit SHA mismatch");
  invariant(payload?.release?.environment === expected.expectedEnvironment, `health-api: expected environment ${expected.expectedEnvironment}`);
  invariant(payload?.release?.branch === expected.expectedBranch, `health-api: expected branch ${expected.expectedBranch}`);
  invariant(response.headers.get("x-revalta-release") === expected.expectedSha.slice(0, 7), "health-api: X-Revalta-Release mismatch");
  invariant(response.headers.get("x-revalta-environment") === expected.expectedEnvironment, "health-api: X-Revalta-Environment mismatch");
  const cache = (response.headers.get("cache-control") ?? "").toLowerCase();
  invariant(cache.includes("no-store") && cache.includes("max-age=0"), "health-api: Cache-Control must be no-store, max-age=0");
  invariant((response.headers.get("cdn-cache-control") ?? "").toLowerCase().includes("no-store"), "health-api: CDN cache must be disabled");
  invariant((response.headers.get("vercel-cdn-cache-control") ?? "").toLowerCase().includes("no-store"), "health-api: Vercel CDN cache must be disabled");
}

export async function readBoundedJsonResponse(response, { label = "response", maxBytes = MAX_HEALTH_BODY_BYTES } = {}) {
  invariant(Number.isSafeInteger(maxBytes) && maxBytes > 0, `${label}: maxBytes must be a positive integer`);

  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    invariant(/^\d+$/.test(declaredLength), `${label}: Content-Length must be a non-negative integer`);
    const parsedLength = Number(declaredLength);
    invariant(Number.isSafeInteger(parsedLength), `${label}: Content-Length is outside the safe integer range`);
    invariant(parsedLength <= maxBytes, `${label}: response exceeds ${maxBytes} byte limit`);
  }

  invariant(response.body, `${label}: response body is missing`);
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      invariant(totalBytes <= maxBytes, `${label}: response exceeds ${maxBytes} byte limit`);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label}: response is not valid UTF-8`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label}: response is not valid JSON`);
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestWithRetry(url, options = {}, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const attempts = dependencies.attempts ?? DEFAULT_ATTEMPTS;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelayMs = dependencies.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const headers = new Headers(options.headers);
      headers.set("user-agent", "Revalta-Release-Boundary-Smoke/1.0");
      if (!headers.has("accept")) headers.set("accept", "*/*");
      return await fetchImpl(url, {
        ...options,
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts && retryDelayMs > 0) await sleep(retryDelayMs * attempt);
    }
  }
  throw new Error(`Request failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export async function runReleaseBoundarySmoke(options, dependencies = {}) {
  const expected = validateOptions(options);
  const routes = [
    { label: "public-home", path: "/" },
    { label: "dashboard-boundary", path: "/dashboard" },
    { label: "health-api", path: "/api/health" },
  ];
  const results = [];

  for (const route of routes) {
    const startedAt = Date.now();
    const response = await requestWithRetry(new URL(route.path, expected.baseUrl), { method: "GET" }, dependencies);
    if (route.label === "public-home") validateHomeBoundary(response, expected.expectedEnvironment);
    if (route.label === "dashboard-boundary") validateDashboardBoundary(response, expected.baseUrl);
    if (route.label === "health-api") {
      const payload = await readBoundedJsonResponse(response, { label: "health-api" });
      validateHealthBoundary(response, payload, expected);
    }
    results.push({
      label: route.label,
      status: response.status,
      durationMs: Date.now() - startedAt,
      location: response.headers.get("location"),
    });
  }

  return {
    baseUrl: expected.baseUrl.origin,
    release: expected.expectedSha,
    environment: expected.expectedEnvironment,
    branch: expected.expectedBranch,
    results,
  };
}

export function renderMarkdownSummary(report) {
  const rows = report.results.map((result) => `| ${result.label} | ${result.status} | ${result.durationMs} ms | ${result.location ?? "—"} |`).join("\n");
  return [
    "## Revalta release boundary smoke",
    "",
    `- URL: \`${report.baseUrl}\``,
    `- SHA: \`${report.release}\``,
    `- Environment: \`${report.environment}\``,
    `- Branch: \`${report.branch}\``,
    "",
    "| Boundary | HTTP | Duration | Location |",
    "| --- | ---: | ---: | --- |",
    rows,
    "",
  ].join("\n");
}

async function main() {
  const report = await runReleaseBoundarySmoke({
    baseUrl: process.env.BASE_URL,
    expectedSha: process.env.EXPECTED_SHA,
    expectedEnvironment: process.env.EXPECTED_ENVIRONMENT,
    expectedBranch: process.env.EXPECTED_BRANCH,
  });
  console.log(`Release boundary smoke passed for ${report.release} (${report.environment}/${report.branch})`);
  for (const result of report.results) console.log(`- ${result.label}: HTTP ${result.status} (${result.durationMs} ms)`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, renderMarkdownSummary(report));
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
