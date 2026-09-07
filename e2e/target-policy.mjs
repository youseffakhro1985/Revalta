export function validateTarget(env) {
  let url;
  try { url = new URL(String(env.E2E_BASE_URL || "")); } catch { throw new Error("E2E_BASE_URL must be a valid origin"); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("E2E target must be an origin without credentials, path or query");
  const local = env.E2E_ALLOW_HTTP_LOCALHOST === "1" && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  const preview = url.protocol === "https:" && !url.port && /^[a-z0-9-]+\.vercel\.app$/.test(url.hostname);
  if (!local && !preview) throw new Error("E2E target must be an exact Vercel Preview or an explicitly allowed localhost");
  const expectedSha = String(env.E2E_EXPECTED_SHA || "");
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) throw new Error("An exact E2E_EXPECTED_SHA is required");
  if (local) {
    for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
      let database;
      try { database = new URL(env[name]); } catch { throw new Error("Isolated local database configuration is required"); }
      if (!["postgresql:", "postgres:"].includes(database.protocol) || !["localhost", "127.0.0.1"].includes(database.hostname) || database.pathname !== "/revalta_e2e") {
        throw new Error("Local fixtures may only use the local revalta_e2e database");
      }
    }
  } else if (env.E2E_PREVIEW_DATA_ISOLATED !== "1" || !env.E2E_VERIFIED_EMAIL || !env.E2E_VERIFIED_PASSWORD) {
    throw new Error("BLOCKED: Preview requires confirmed isolated test data and a verified fixture account");
  }
  return { baseUrl: url.origin, isLocal: local, expectedSha };
}

export function validateRelease(health, target) {
  if (health?.status !== "ok" || health?.database !== "ok" || health?.release?.commitSha !== target.expectedSha) {
    throw new Error("Health/release identity does not match the exact candidate SHA");
  }
  if (!target.isLocal && (health.release.environment !== "preview" || !health.release.deploymentId)) {
    throw new Error("Remote E2E requires a healthy identified Preview deployment");
  }
}
