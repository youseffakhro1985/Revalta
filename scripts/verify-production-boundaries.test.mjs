import { describe, expect, it } from "vitest";
import {
  requestWithRetry,
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
