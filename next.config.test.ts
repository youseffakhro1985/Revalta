import { afterEach, describe, expect, it, vi } from "vitest";

type Header = { key: string; value: string };
type HeaderRule = { source: string; headers: Header[] };

async function loadGlobalHeaders(vercelEnv: string | undefined, nodeEnv: string) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);

  if (vercelEnv) {
    vi.stubEnv("VERCEL_ENV", vercelEnv);
  } else {
    vi.stubEnv("VERCEL_ENV", "");
  }

  const { default: nextConfig } = await import("./next.config.mjs");
  const rules = (await nextConfig.headers?.()) as HeaderRule[];
  const globalRule = rules.find((rule) => rule.source === "/(.*)");

  expect(globalRule).toBeDefined();
  return new Map(globalRule!.headers.map((header) => [header.key, header.value]));
}

function expectBrowserIsolationHeaders(headers: Map<string, string>) {
  expect(headers.get("X-DNS-Prefetch-Control")).toBe("off");
  expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
  expect(headers.get("Origin-Agent-Cluster")).toBe("?1");
  expect(headers.get("X-Permitted-Cross-Domain-Policies")).toBe("none");
}

describe("Next.js environment security headers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("marks every Vercel Preview response as non-indexable", async () => {
    const headers = await loadGlobalHeaders("preview", "production");

    expect(headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive, nosnippet");
    expect(headers.get("X-Revalta-Environment")).toBe("preview");
    expect(headers.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
    expectBrowserIsolationHeaders(headers);
  });

  it("identifies Production without adding Preview indexing directives", async () => {
    const headers = await loadGlobalHeaders("production", "production");

    expect(headers.has("X-Robots-Tag")).toBe(false);
    expect(headers.get("X-Revalta-Environment")).toBe("production");
    expect(headers.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
    expectBrowserIsolationHeaders(headers);
  });

  it("keeps local development usable without deployment markers", async () => {
    const headers = await loadGlobalHeaders(undefined, "development");
    const csp = headers.get("Content-Security-Policy");

    expect(headers.has("X-Robots-Tag")).toBe(false);
    expect(headers.has("X-Revalta-Environment")).toBe(false);
    expect(headers.has("Strict-Transport-Security")).toBe(false);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expectBrowserIsolationHeaders(headers);
  });
});
