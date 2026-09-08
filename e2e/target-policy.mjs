import { PREVIEW_DATA_PLANE_ID, PRODUCTION_DATA_PLANE_ID } from "./data-plane-attestations.mjs";

const DATA_PLANE_ID_PATTERN = /^[a-f0-9]{64}$/;

function validatePinnedDataPlanes() {
  if (!DATA_PLANE_ID_PATTERN.test(PREVIEW_DATA_PLANE_ID) || !DATA_PLANE_ID_PATTERN.test(PRODUCTION_DATA_PLANE_ID)) {
    throw new Error("BLOCKED: release data-plane attestations are invalid");
  }
  if (PREVIEW_DATA_PLANE_ID === PRODUCTION_DATA_PLANE_ID) {
    throw new Error("BLOCKED: Preview and Production data-plane identities must be different");
  }
}

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
  let fixtureReady = true;
  if (local) {
    for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
      let database;
      try { database = new URL(env[name]); } catch { throw new Error("Isolated local database configuration is required"); }
      if (!["postgresql:", "postgres:"].includes(database.protocol) || !["localhost", "127.0.0.1"].includes(database.hostname) || database.pathname !== "/revalta_e2e") {
        throw new Error("Local fixtures may only use the local revalta_e2e database");
      }
    }
  } else {
    validatePinnedDataPlanes();
    fixtureReady = env.E2E_PREVIEW_DATA_ISOLATED === "1"
      && Boolean(env.E2E_VERIFIED_EMAIL)
      && Boolean(env.E2E_VERIFIED_PASSWORD)
      && Boolean(String(env.E2E_VERIFIED_COMPANY_ID || "").trim());

    // Data-plane identities are version-controlled reviewed attestations. Optional
    // environment copies may be supplied by operations, but can only confirm the
    // pinned values and can never override them.
    const configuredPreview = String(env.E2E_PREVIEW_DATA_PLANE_ID || "").trim().toLowerCase();
    const configuredProduction = String(env.E2E_PRODUCTION_DATA_PLANE_ID || "").trim().toLowerCase();
    if (configuredPreview && configuredPreview !== PREVIEW_DATA_PLANE_ID) {
      throw new Error("BLOCKED: configured Preview data-plane identity disagrees with the reviewed release attestation");
    }
    if (configuredProduction && configuredProduction !== PRODUCTION_DATA_PLANE_ID) {
      throw new Error("BLOCKED: configured Production data-plane identity disagrees with the reviewed release attestation");
    }
    expectedDataPlaneId = PREVIEW_DATA_PLANE_ID;
  }
  return { baseUrl: url.origin, isLocal: local, expectedSha, expectedDataPlaneId, fixtureReady };
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
    // Check runtime identity before fixture presence. This keeps the gate fail-closed
    // while making a wrong Preview database distinguishable from missing test data.
    if (!target.fixtureReady) {
      throw new Error("BLOCKED: Preview runtime data plane is attested, but confirmed isolated fixtures and verified credentials are still required");
    }
  }
  if (initialHealth && health.release.deploymentId !== initialHealth.release.deploymentId) {
    throw new Error("Deployment identity changed during browser verification");
  }
}
