import { describe, expect, it } from "vitest";
import {
  requestWithRetry,
  validateDashboardBoundary,
  validateGlobalHeaders,
  validateHealthPayload,
  validateSensitiveCache,
} from "./verify-production-boundaries.mjs";

function secureHeaders(overrides = {}) {
  return new Headers({
    "x-revalta-environment": "production",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "cross-origin-opener-policy": "same-origin",
    "origin-agent-cluster": "?1",
    "x-permitted-cross-domain-policies": "none",
    "x-dns-prefetch-control": "off",
    "content-security-policy": "default-src 'self'; object-src 'none'; frame-ancestors 'none'",
    ...overrides,
  });
}

describe("production boundary validation", () => {
  it("accepts the complete production security boundary", () => {
    expect(() => validateGlobalHeaders(secureHeaders(), "home")).not.toThrow();
  });

  it("rejects Preview indexing directives in Production", () => {
    const headers = secureHeaders({ "x-robots-tag": "noindex" });
    expect(() => validateGlobalHeaders(headers, "home")).toThrow(/must not emit X-Robots-Tag/);
  });

  it("requires the complete private no-store cache policy", () => {
    const valid = new Headers({ "cache-control": "private, no-store, max-age=0, must-revalidate" });
    expect(() => validateSensitiveCache(valid, "dashboard")).not.toThrow();

    const invalid = new Headers({ "cache-control": "private, max-age=0" });
    expect(() => validateSensitiveCache(invalid, "dashboard")).toThrow(/no-store/);
  });

  it("requires unauthenticated dashboard traffic to redirect to the local login route", () => {
    const redirect = new Response(null, {
      status: 307,
      headers: { location: "https://www.revalta.se/login?next=%2Fdashboard" },
    });
    expect(() => validateDashboardBoundary(redirect, "https://www.revalta.se")).not.toThrow();

    const publicDashboard = new Response("dashboard", { status: 200 });
    expect(() => validateDashboardBoundary(publicDashboard, "https://www.revalta.se")).toThrow(/must redirect or deny access/);

    const externalRedirect = new Response(null, {
      status: 302,
      headers: { location: "https://attacker.example/login" },
    });
    expect(() => validateDashboardBoundary(externalRedirect, "https://www.revalta.se")).toThrow(/escaped Revalta origin/);
  });

  it("accepts an explicit unauthenticated denial at the dashboard boundary", () => {
    expect(() => validateDashboardBoundary(new Response(null, { status: 401 }), "https://www.revalta.se")).not.toThrow();
    expect(() => validateDashboardBoundary(new Response(null, { status: 403 }), "https://www.revalta.se")).not.toThrow();
  });

  it("binds health release metadata to the response header", () => {
    const headers = new Headers({ "x-revalta-release": "abcdef1" });
    const payload = {
      ok: true,
      status: "ok",
      database: "ok",
      release: {
        environment: "production",
        commitSha: "a".repeat(40),
        shortCommitSha: "abcdef1",
        branch: "main",
      },
    };

    expect(() => validateHealthPayload(payload, headers)).not.toThrow();
    headers.set("x-revalta-release", "1234567");
    expect(() => validateHealthPayload(payload, headers)).toThrow(/does not match/);
  });

  it("retries transient network failures", async () => {
    let calls = 0;
    const response = new Response("ok", { status: 200 });
    const fetchImpl = async () => {
      calls += 1;
      if (calls < 3) throw new Error("temporary outage");
      return response;
    };

    await expect(
      requestWithRetry("https://example.test", {}, {
        fetchImpl,
        attempts: 3,
        timeoutMs: 1_000,
        retryDelayMs: 0,
      }),
    ).resolves.toBe(response);
    expect(calls).toBe(3);
  });
});
