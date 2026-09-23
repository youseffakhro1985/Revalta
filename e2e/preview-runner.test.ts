import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runAuthNavigation } from "./auth-navigation.mjs";
import { readPreviewHealth, REQUIRED_STEPS, runVerifiedPreview } from "./preview-runner.mjs";
import { PREVIEW_DATA_PLANE_ID, PRODUCTION_DATA_PLANE_ID } from "./data-plane-attestations.mjs";

const env = {
  NODE_ENV: "test" as const,
  E2E_BASE_URL: "https://revalta-candidate.vercel.app", E2E_EXPECTED_SHA: "a".repeat(40),
  E2E_PREVIEW_DATA_ISOLATED: "1", E2E_VERIFIED_EMAIL: "fixture@example.com",
  E2E_VERIFIED_PASSWORD: "synthetic", E2E_VERIFIED_COMPANY_ID: "synthetic-company",
};
const health = {
  status: "ok", database: "ok", schemaReady: true,
  release: { commitSha: env.E2E_EXPECTED_SHA, environment: "preview", deploymentId: "dpl_fixture" },
  dataPlane: { identity: PREVIEW_DATA_PLANE_ID, directMatches: true },
};
type Gate = { complete: (step: string) => void; assertRelease: () => Promise<void> };
const completeAll = async ({ complete }: Gate) => REQUIRED_STEPS.forEach(complete);

describe("actual browser entry point fails before browser launch", () => {
  it.each([
    { release: { ...health.release, commitSha: "b".repeat(40) } },
    { release: { ...health.release, environment: "production" } },
    { release: { ...health.release, deploymentId: null } },
    { dataPlane: { identity: PRODUCTION_DATA_PLANE_ID, directMatches: true } },
    { dataPlane: { identity: PREVIEW_DATA_PLANE_ID, directMatches: false } },
    { database: "error" },
    { schemaReady: false },
  ])("rejects invalid runtime attestation: %j", async (change) => {
    const launch = vi.fn();
    await expect(runAuthNavigation(env, { chromium: { launch }, readHealth: async () => ({ ...health, ...change }) })).rejects.toThrow();
    expect(launch).not.toHaveBeenCalled();
  });
  it.each(["E2E_VERIFIED_EMAIL", "E2E_VERIFIED_PASSWORD", "E2E_VERIFIED_COMPANY_ID", "E2E_PREVIEW_DATA_ISOLATED"])("rejects missing %s", async (key) => {
    const launch = vi.fn();
    await expect(runAuthNavigation({ ...env, [key]: "" }, { chromium: { launch }, readHealth: async () => health })).rejects.toThrow();
    expect(launch).not.toHaveBeenCalled();
  });
  it("rejects Production before any health request", async () => {
    const readHealth = vi.fn();
    await expect(runAuthNavigation({ ...env, E2E_BASE_URL: "https://www.revalta.se" }, { readHealth })).rejects.toThrow();
    expect(readHealth).not.toHaveBeenCalled();
  });
  it("does not let an explicitly allowed localhost satisfy the required gate", async () => {
    const readHealth = vi.fn();
    await expect(runAuthNavigation({ ...env, E2E_BASE_URL: "http://127.0.0.1:3000", E2E_ALLOW_HTTP_LOCALHOST: "1",
      DATABASE_URL: "postgresql://localhost/revalta_e2e", DIRECT_URL: "postgresql://localhost/revalta_e2e",
    }, { readHealth })).rejects.toThrow(/local verification/);
    expect(readHealth).not.toHaveBeenCalled();
  });
});

describe("mandatory flow completion and mutation order", () => {
  it.each(REQUIRED_STEPS)("rejects skipping %s", async (skip) => {
    await expect(runVerifiedPreview(env, async ({ complete }: Gate) => {
      REQUIRED_STEPS.filter((step: string) => step !== skip).forEach(complete);
    }, async () => health)).rejects.toThrow(/skipped/);
  });
  it("never invokes the suite when health times out", async () => {
    const suite = vi.fn();
    await expect(runVerifiedPreview(env, suite, async () => { throw new Error("timeout"); })).rejects.toThrow();
    expect(suite).not.toHaveBeenCalled();
  });
  it("checks health before entry and before mutation, then at completion", async () => {
    const events: string[] = [];
    const evidence = await runVerifiedPreview(env, async (gate: Gate) => {
      events.push("suite");
      await gate.assertRelease();
      events.push("mutation");
      await completeAll(gate);
    }, async () => { events.push("health"); return health; });
    expect(events).toEqual(["health", "suite", "health", "mutation", "health"]);
    expect(evidence).toMatchObject({ status: "PASS", commitSha: env.E2E_EXPECTED_SHA, completed: REQUIRED_STEPS });
  });
  it("does not recover to green if a caught mutation gate failure is followed by healthy status", async () => {
    let calls = 0;
    const mutation = vi.fn();
    await expect(runVerifiedPreview(env, async (gate: Gate) => {
      try { await gate.assertRelease(); mutation(); } catch { /* browser aborts request */ }
      await completeAll(gate);
    }, async () => ++calls === 2 ? { ...health, release: { ...health.release, deploymentId: "changed" } } : health)).rejects.toThrow();
    expect(mutation).not.toHaveBeenCalled();
  });
  it("retries a transient health transport error without latching a false identity failure", async () => {
    let calls = 0;
    const evidence = await runVerifiedPreview(env, async (gate: Gate) => {
      await gate.assertRelease();
      await completeAll(gate);
    }, async () => {
      calls += 1;
      if (calls === 2) throw new Error("timeout");
      return health;
    });
    expect(calls).toBe(4);
    expect(evidence.status).toBe("PASS");
  });
  it("rejects a deployment change at final verification", async () => {
    let calls = 0;
    await expect(runVerifiedPreview(env, completeAll, async () => ++calls === 1 ? health : {
      ...health, release: { ...health.release, deploymentId: "changed" },
    })).rejects.toThrow();
  });
});

describe("health transport", () => {
  it("requires HTTP 200 even if a failing response contains healthy JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(health), { status: 503 })));
    try { await expect(readPreviewHealth({ baseUrl: env.E2E_BASE_URL }, {})).rejects.toThrow(/HTTP 200/); }
    finally { vi.unstubAllGlobals(); }
  });
  it("names a schema 503 without leaking missing columns", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "degraded",
      ok: false,
      database: "ok",
      schemaReady: false,
      components: { database: "ok", schema: "missing", dataPlane: "ok" },
    }), { status: 503 })));
    try {
      await expect(readPreviewHealth({ baseUrl: env.E2E_BASE_URL }, {})).rejects.toThrow(
        /Preview schema is not ready for this release/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("names a data-plane 503 without leaking datastore identity", async () => {
    const identity = "e".repeat(64);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "degraded",
      ok: false,
      database: "ok",
      schemaReady: true,
      components: { database: "ok", schema: "ok", dataPlane: "mismatch" },
      dataPlane: { identity, directMatches: false },
    }), { status: 503 })));
    try {
      await readPreviewHealth({ baseUrl: env.E2E_BASE_URL }, {});
      throw new Error("health unexpectedly succeeded");
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      expect(message).toMatch(/Preview data-plane isolation is not ready for this release/);
      expect(message).not.toContain(identity);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("prefers schema unreadiness when both schema and data-plane are degraded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "degraded",
      ok: false,
      schemaReady: false,
      components: { database: "ok", schema: "missing", dataPlane: "mismatch" },
      dataPlane: { identity: "e".repeat(64), directMatches: false },
    }), { status: 503 })));
    try {
      await expect(readPreviewHealth({ baseUrl: env.E2E_BASE_URL }, {})).rejects.toThrow(
        /Preview schema is not ready for this release/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("forbids redirects and bounds health requests", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(health)));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await readPreviewHealth({ baseUrl: env.E2E_BASE_URL }, {});
      expect(fetchMock).toHaveBeenCalledWith(`${env.E2E_BASE_URL}/api/health`, expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }));
    } finally { vi.unstubAllGlobals(); }
  });
});

it("required workflow does not replace Preview with localhost or report success from resolution alone", () => {
  const workflow = readFileSync(new URL("../.github/workflows/e2e-preview.yml", import.meta.url), "utf8");
  expect(workflow).not.toContain("url=http://127.0.0.1");
  expect(workflow).not.toContain("E2E_ALLOW_HTTP_LOCALHOST");
  expect(workflow).toContain("E2E_EXPECTED_SHA: ${{ github.event.pull_request.head.sha || github.sha }}");
  expect(workflow).toContain("BROWSER_OUTCOME: ${{ steps.browser.outcome }}");
  expect(workflow).toContain('if [[ "$BROWSER_OUTCOME" == "success" ]]');
});

it("required browser flow uses the live Fastigheter dashboard route", () => {
  const source = readFileSync(new URL("./auth-navigation.mjs", import.meta.url), "utf8");
  expect(source).toContain('expectPath(page, "/dashboard/fastigheter")');
  expect(source).not.toContain("/dashboard/properties");
  expect(source).toContain('pathname === "/api/auth/login"');
  expect(source).toContain("sanitizePreviewFailure");
  expect(source).toContain("form#register-form[data-ready='1']");
  expect(source).toContain("register POST did not produce a response");
});

it("actual runner intercepts POST before forwarding and aborts when the datastore changes", async () => {
  let handler: (route: unknown) => Promise<void> = async () => { throw new Error("not installed"); };
  let calls = 0;
  const context = {
    route: vi.fn(async (_pattern: string, callback: typeof handler) => { handler = callback; }),
    newPage: async () => ({ on: vi.fn(), goto: async () => { throw new Error("stop fake browser"); } }),
    close: vi.fn(),
  };
  const browser = { newContext: async () => context, close: vi.fn() };
  await expect(runAuthNavigation(env, {
    chromium: { launch: async () => browser },
    readHealth: async () => ++calls === 1 ? health : { ...health, dataPlane: { identity: PRODUCTION_DATA_PLANE_ID, directMatches: true } },
  })).rejects.toThrow("stop fake browser");
  const forward = vi.fn();
  const abort = vi.fn();
  await handler({ request: () => ({ url: () => `${env.E2E_BASE_URL}/api/auth/register`, method: () => "POST", headers: () => ({}) }), continue: forward, abort });
  expect(forward).not.toHaveBeenCalled();
  expect(abort).toHaveBeenCalledWith("blockedbyclient");
  expect(context.close).toHaveBeenCalled();
  expect(browser.close).toHaveBeenCalled();
});
