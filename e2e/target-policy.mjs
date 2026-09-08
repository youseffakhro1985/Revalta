const DATA_PLANE_ID_PATTERN = /^[a-f0-9]{64}$/;

export function validateTarget(env) {
  let url;
  try { url = new URL(String(env.E2E_BASE_URL || "")); } catch { throw new Error("E2E_BASE_URL must be a valid origin"); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("E2E target must be an origin without credentials, path or query");
  const local = env.E2E_ALLOW_HTTP_LOCALHOST === "1" && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  const preview = url.protocol === "https:" && !url.port && /^[a-z0-9-]+\.vercel\.app$/.test(url.hostname);
  if (!local && !preview) throw new Error("E2E target must be an exact Vercel Preview or an explicitly allowed localhost");
  const expectedSha = String(env.E2E_EXPECTED_SHA || "");
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) throw new Error("An exact E2E_EXPECTED_SHA is required");

  let expectedDataPlaneId = null;
  if (local) {
    for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
      let database;
      try { database = new URL(env[name]); } catch { throw new Error("Isolated local database configuration is required"); }
      if (!["postgresql:", "postgres:"].includes(database.protocol) || !["localhost", "127.0.0.1"].includes(database.hostname) || database.pathname !== "/revalta_e2e") {
        throw new Error("Local fixtures may only use the local revalta_e2e database");
      }
    }
  } else {
    const previewDataPlaneId = String(env.E2E_PREVIEW_DATA_PLANE_ID || "").trim().toLowerCase();
    const productionDataPlaneId = String(env.E2E_PRODUCTION_DATA_PLANE_ID || "").trim().toLowerCase();
    const hasFixture = env.E2E_PREVIEW_DATA_ISOLATED === "1"
      && Boolean(env.E2E_VERIFIED_EMAIL)
      && Boolean(env.E2E_VERIFIED_PASSWORD)
      && Boolean(String(env.E2E_VERIFIED_COMPANY_ID || "").trim());
    if (!hasFixture || !DATA_PLANE_ID_PATTERN.test(previewDataPlaneId) || !DATA_PLANE_ID_PATTERN.test(productionDataPlaneId)) {
      throw new Error("BLOCKED: Preview requires confirmed isolated test data, verified fixtures and attested Preview/Production data-plane identities");
    }
    if (previewDataPlaneId === productionDataPlaneId) {
      throw new Error("BLOCKED: Preview and Production data-plane identities must be different");
    }
    expectedDataPlaneId = previewDataPlaneId;
  }
  return { baseUrl: url.origin, isLocal: local, expectedSha, expectedDataPlaneId };
}

export function validateRelease(health, target, initialHealth) {
  if (health?.status !== "ok" || health?.database !== "ok" || health?.release?.commitSha !== target.expectedSha) {
    throw new Error("Health/release identity does not match the exact candidate SHA");
  }
  if (!target.isLocal) {
    if (health.release.environment !== "preview" || !health.release.deploymentId) {
      throw new Error("Remote E2E requires a healthy identified Preview deployment");
    }
    if (!health?.dataPlane?.directMatches || health?.dataPlane?.identity !== target.expectedDataPlaneId) {
      throw new Error("Preview runtime data-plane identity does not match the independently attested isolated datastore");
    }
  }
  if (initialHealth && health.release.deploymentId !== initialHealth.release.deploymentId) {
    throw new Error("Deployment identity changed during browser verification");
  }
}
