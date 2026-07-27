const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const PRODUCTION_ORIGIN = "https://www.revalta.se";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateReleaseTarget(input) {
  invariant(input && typeof input === "object", "Release target input is required");

  const rawBaseUrl = String(input.baseUrl ?? "").trim();
  const expectedSha = String(input.expectedSha ?? "").trim().toLowerCase();
  const environment = String(input.environment ?? "").trim();
  const branch = String(input.branch ?? "").trim();

  invariant(rawBaseUrl, "BASE_URL is required");
  const url = new URL(rawBaseUrl);
  invariant(url.protocol === "https:", "BASE_URL must use HTTPS");
  invariant(!url.username && !url.password, "BASE_URL must not contain credentials");
  invariant(!url.port, "BASE_URL must not contain an explicit port");
  invariant(url.pathname === "/" || url.pathname === "", "BASE_URL must be an origin without a path");
  invariant(!url.search, "BASE_URL must not contain a query string");
  invariant(!url.hash, "BASE_URL must not contain a fragment");
  invariant(SHA_PATTERN.test(expectedSha), "EXPECTED_SHA must be a full 40-character Git commit SHA");
  invariant(environment === "preview" || environment === "production", "EXPECTED_ENVIRONMENT must be preview or production");

  if (environment === "production") {
    invariant(branch === "main", "Production smoke must target branch main");
    invariant(url.origin === PRODUCTION_ORIGIN, `Production smoke must target ${PRODUCTION_ORIGIN}`);
  } else {
    invariant(branch === "release-preview", "Preview smoke must target branch release-preview");
    invariant(url.origin !== PRODUCTION_ORIGIN, "Preview smoke must not target the production origin");
  }

  return {
    baseUrl: url.origin,
    expectedSha,
    environment,
    branch,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const target = validateReleaseTarget({
      baseUrl: process.env.BASE_URL,
      expectedSha: process.env.EXPECTED_SHA,
      environment: process.env.EXPECTED_ENVIRONMENT,
      branch: process.env.EXPECTED_BRANCH,
    });
    console.log(`Release target validated: ${target.environment}/${target.branch} ${target.baseUrl} ${target.expectedSha}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
