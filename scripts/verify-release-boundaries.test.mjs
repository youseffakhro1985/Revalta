import { describe, expect, it, vi } from "vitest";
import {
  requestWithRetry,
  runReleaseBoundarySmoke,
  validateDashboardBoundary,
  validateHealthBoundary,
  validateHomeBoundary,
  validateOptions,
} from "./verify-release-boundaries.mjs";

const SHA = "8bc96155bae822be9d1ecd3002a21f88889e9a9f";

function securityHeaders(extra = {}) {
  return new Headers({
    "content-security-policy": "default-src 'self'; object-src 'none'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    ...extra,
  });
}

function privateHeaders(extra = {}) {
  return securityHeaders({
    "cache-control": "private, no-store, max-age=0, must-revalidate",
    "cdn-cache-control": "no-store",
    "vercel-cdn-cache-control": "no-store",
    ...extra,
  });
}

function healthResponse({ environment = "preview", branch = "release-preview", sha = SHA } = {}) {
  return new Response(JSON.stringify({
    ok: true,
    status: "ok",
    database: "ok",
    release: {
      commitSha: sha,
      shortCommitSha: sha.slice(0, 7),
      environment,
      branch,
    },
  }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store, max-age=0",
      "cdn-cache-control": "no-store",
      "vercel-cdn-cache-control": "no-store",
      "x-revalta-release": sha.slice(0, 7),
      "x-revalta-environment": environment,
    },
  });
}

describe("release boundary smoke", () => {
  it("requires HTTPS, full SHA, environment and branch", () => {
    expect(() => validateOptions({
      baseUrl: "http://preview.example",
      expectedSha: SHA,
      expectedEnvironment: "preview",
      expectedBranch: "release-preview",
    })).toThrow("HTTPS");
    expect(() => validateOptions({
      baseUrl: "https://preview.example",
      expectedSha: "8bc9615",
      expectedEnvironment: "preview",
      expectedBranch: "release-preview",
    })).toThrow("40-character");
    expect(() => validateOptions({
      baseUrl: "https://www.revalta.se",
      expectedSha: SHA,
      expectedEnvironment: "production",
      expectedBranch: "release-preview",
    })).toThrow("branch main");
  });

  it("requires noindex on preview and forbids it in production", () => {
    const preview = new Response("ok", { status: 200, headers: securityHeaders({ "x-robots-tag": "noindex, nofollow" }) });
    expect(() => validateHomeBoundary(preview, "preview")).not.toThrow();
    expect(() => validateHomeBoundary(preview, "production")).toThrow("must not emit noindex");

    const production = new Response("ok", { status: 200, headers: securityHeaders() });
    expect(() => validateHomeBoundary(production, "production")).not.toThrow();
    expect(() => validateHomeBoundary(production, "preview")).toThrow("must emit noindex");
  });

  it("rejects a public dashboard and cross-origin login redirects", () => {
    const publicDashboard = new Response("dashboard", { status: 200, headers: privateHeaders() });
    expect(() => validateDashboardBoundary(publicDashboard, new URL("https://preview.example"))).toThrow("redirect/401/403");

    const escaped = new Response(null, {
      status: 307,
      headers: privateHeaders({ location: "https://evil.example/login" }),
    });
    expect(() => validateDashboardBoundary(escaped, new URL("https://preview.example"))).toThrow("escaped origin");
  });

  it("rejects stale releases and environment or branch mismatches", async () => {
    const expected = {
      expectedSha: SHA,
      expectedEnvironment: "preview",
      expectedBranch: "release-preview",
    };
    const stale = healthResponse({ sha: "1111111111111111111111111111111111111111" });
    await expect(stale.clone().json().then((payload) => validateHealthBoundary(stale, payload, expected))).rejects.toThrow("commit SHA");

    const wrongBranch = healthResponse({ branch: "feature-branch" });
    await expect(wrongBranch.clone().json().then((payload) => validateHealthBoundary(wrongBranch, payload, expected))).rejects.toThrow("expected branch");

    const wrongEnvironment = healthResponse({ environment: "production" });
    await expect(wrongEnvironment.clone().json().then((payload) => validateHealthBoundary(wrongEnvironment, payload, expected))).rejects.toThrow("expected environment");
  });

  it("verifies a complete preview release against the exact SHA", async () => {
    const fetchImpl = vi.fn(async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/") {
        return new Response("home", { status: 200, headers: securityHeaders({ "x-robots-tag": "noindex, nofollow" }) });
      }
      if (pathname === "/dashboard") {
        return new Response(null, { status: 307, headers: privateHeaders({ location: "/login" }) });
      }
      if (pathname === "/api/health") return healthResponse();
      throw new Error(`Unexpected path ${pathname}`);
    });

    const report = await runReleaseBoundarySmoke({
      baseUrl: "https://preview.example",
      expectedSha: SHA,
      expectedEnvironment: "preview",
      expectedBranch: "release-preview",
    }, { fetchImpl, attempts: 1, retryDelayMs: 0 });

    expect(report.release).toBe(SHA);
    expect(report.results).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries transient network failures without accepting a bad response", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("temporary network error"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await requestWithRetry("https://preview.example", {}, {
      fetchImpl,
      attempts: 2,
      retryDelayMs: 0,
      timeoutMs: 100,
    });
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
