import { validateRelease, validateTarget } from "./target-policy.mjs";

export const REQUIRED_STEPS = Object.freeze([
  "verified-login-and-profile", "dashboard", "desktop-navigation", "properties-api",
  "command-center-api", "mobile-navigation-and-command-center",
  "logout-and-protected-redirect", "public-auth-verification",
]);

export async function readPreviewHealth(target, env) {
  let response;
  try {
    response = await fetch(`${target.baseUrl}/api/health`, {
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? { "x-vercel-protection-bypass": env.VERCEL_AUTOMATION_BYPASS_SECRET.trim() }
        : {},
    });
  } catch {
    throw new Error("BLOCKED: Preview health request failed or timed out");
  }
  if (response.status !== 200) throw new Error("BLOCKED: Preview health must return HTTP 200");
  try { return await response.json(); } catch { throw new Error("BLOCKED: Preview health is not valid JSON"); }
}

// This orchestrator is used by the executable browser entry point. Browser setup
// cannot run before attestation; returning early can never count as acceptance.
export async function runVerifiedPreview(env, runBrowser, readHealth = readPreviewHealth) {
  const target = validateTarget(env);
  if (target.isLocal) throw new Error("BLOCKED: local verification cannot satisfy required Preview acceptance");
  const initialHealth = await readHealth(target, env);
  validateRelease(initialHealth, target);
  const completed = new Set();
  let gateFailed = false;
  const assertRelease = async () => {
    if (gateFailed) throw new Error("BLOCKED: release verification previously failed");
    try {
      validateRelease(await readHealth(target, env), target, initialHealth);
    } catch {
      gateFailed = true;
      throw new Error("BLOCKED: release identity changed or became unverifiable");
    }
  };
  await runBrowser({
    target, assertRelease,
    complete(step) {
      if (!REQUIRED_STEPS.includes(step)) throw new Error("Unknown browser verification step");
      completed.add(step);
      console.log(`PASS: ${step}`);
    },
  });
  await assertRelease();
  if (REQUIRED_STEPS.some((step) => !completed.has(step))) {
    throw new Error("BLOCKED: mandatory browser verification steps were skipped");
  }
  return {
    status: "PASS", mode: "preview", commitSha: target.expectedSha,
    deploymentId: initialHealth.release.deploymentId,
    dataPlaneId: target.expectedDataPlaneId,
    completed: [...completed],
  };
}
