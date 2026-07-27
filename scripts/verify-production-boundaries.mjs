import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "https://www.revalta.se";
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRY_DELAY_MS = 1_500;

const globalHeaders = new Map([
  ["x-revalta-environment", "production"],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["cross-origin-opener-policy", "same-origin"],
  ["origin-agent-cluster", "?1"],
  ["x-permitted-cross-domain-policies", "none"],
  ["x-dns-prefetch-control", "off"],
]);

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function validateGlobalHeaders(headers, label) {
  for (const [name, expected] of globalHeaders) {
    const actual = headers.get(name);
    invariant(actual === expected, `${label}: expected ${name}=${expected}, received ${actual ?? "<missing>"}`);
  }

  const csp = headers.get("content-security-policy") ?? "";
  invariant(csp.includes("default-src 'self'"), `${label}: Content-Security-Policy is missing default-src 'self'`);
  invariant(csp.includes("frame-ancestors 'none'"), `${label}: Content-Security-Policy is missing frame-ancestors 'none'`);
  invariant(csp.includes("object-src 'none'"), `${label}: Content-Security-Policy is missing object-src 'none'`);
  invariant(!headers.has("x-robots-tag"), `${label}: Production must not emit X-Robots-Tag`);
}

export function validateSensitiveCache(headers, label) {
  const cacheControl = (headers.get("cache-control") ?? "").toLowerCase();
  for (const directive of ["private", "no-store", "max-age=0", "must-revalidate"]) {
    invariant(cacheControl.includes(directive), `${label}: Cache-Control is missing ${directive}; received ${cacheControl || "<missing>"}`);
  }
}

export function validateHealthPayload(payload, headers) {
  invariant(payload?.ok === true, "health: expected ok=true");
  invariant(payload?.status === "ok", "health: expected status=ok");
  invariant(payload?.database === "ok", "health: expected database=ok");
  invariant(payload?.release?.environment === "production", "health: expected production release environment");
  invariant(/^[0-9a-f]{40}$/.test(payload?.release?.commitSha ?? ""), "health: invalid full commit SHA");
  invariant(/^[0-9a-f]{7}$/.test(payload?.release?.shortCommitSha ?? ""), "health: invalid short commit SHA");
  invariant(payload?.release?.branch === "main", "health: expected main release branch");
  invariant(headers.get("x-revalta-release") === payload.release.shortCommitSha, "health: X-Revalta-Release does not match payload");
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
      const requestHeaders = new Headers(options.headers);
      requestHeaders.set("user-agent", "Revalta-Production-Boundary-Monitor/1.0");
      if (!requestHeaders.has("accept")) requestHeaders.set("accept", "*/*");

      const response = await fetchImpl(url, {
        redirect: "manual",
        ...options,
        headers: requestHeaders,
        signal: AbortSignal.timeout(timeoutMs),
      });
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts && retryDelayMs > 0) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }

  throw new Error(`Request failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function verifyRoute(baseUrl, route) {
  const startedAt = Date.now();
  const response = await requestWithRetry(new URL(route.path, baseUrl), { method: "GET" });
  invariant(route.allowedStatuses.includes(response.status), `${route.label}: unexpected HTTP ${response.status}`);
  validateGlobalHeaders(response.headers, route.label);

  if (route.sensitive) {
    validateSensitiveCache(response.headers, route.label);
  }

  return {
    label: route.label,
    status: response.status,
    durationMs: Date.now() - startedAt,
    response,
  };
}

export async function runProductionBoundaryMonitor(baseUrl = DEFAULT_BASE_URL) {
  const routes = [
    { label: "public-home", path: "/", allowedStatuses: [200], sensitive: false },
    { label: "dashboard-boundary", path: "/dashboard", allowedStatuses: [200, 301, 302, 303, 307, 308, 401, 403], sensitive: true },
    { label: "health-api", path: "/api/health", allowedStatuses: [200], sensitive: true },
  ];

  const results = [];
  for (const route of routes) {
    results.push(await verifyRoute(baseUrl, route));
  }

  const health = results.find((result) => result.label === "health-api");
  invariant(health, "health-api result is missing");
  const payload = await health.response.json();
  validateHealthPayload(payload, health.response.headers);

  return {
    release: payload.release.shortCommitSha,
    results: results.map(({ label, status, durationMs }) => ({ label, status, durationMs })),
  };
}

async function main() {
  const baseUrl = process.env.BASE_URL ?? DEFAULT_BASE_URL;
  const report = await runProductionBoundaryMonitor(baseUrl);

  console.log(`Production boundary monitor passed for release ${report.release}`);
  for (const result of report.results) {
    console.log(`- ${result.label}: HTTP ${result.status} (${result.durationMs} ms)`);
  }
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
