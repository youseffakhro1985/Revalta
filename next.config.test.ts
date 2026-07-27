import { afterEach, describe, expect, it, vi } from "vitest";

type Header = { key: string; value: string };
type HeaderRule = { source: string; headers: Header[] };

const PRIVATE_NO_STORE = "private, no-store, max-age=0, must-revalidate";

async function loadHeaderRules(vercelEnv: string | undefined, nodeEnv: string) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);

  if (vercelEnv) {
    vi.stubEnv("VERCEL_ENV", vercelEnv);
  } else {
    vi.stubEnv("VERCEL_ENV", "");
  }

  const { default: nextConfig } = await import("./next.config.mjs");
  return (await nextConfig.headers?.()) as HeaderRule[];
}

function toHeaderMap(rule: HeaderRule | undefined) {
  expect(rule).toBeDefined();
  return new Map(rule!.headers.map((header) => [header.key, header.value]));
}

async function loadGlobalHeaders(vercelEnv: string | undefined, nodeEnv: string) {
  const rules = await loadHeaderRules(vercelEnv, nodeEnv);
  return toHeaderMap(rules.find((rule) => rule.source === "/(.*)"));
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

  it("keeps dashboard and API responses strictly non-cacheable", async () => {
    const rules = await loadHeaderRules("production", "production");
    const dashboardHeaders = toHeaderMap(rules.find((rule) => rule.source === "/dashboard/:path*"));
    const apiHeaders = toHeaderMap(rules.find((rule) => rule.source === "/api/:path*"));
    const globalHeaders = toHeaderMap(rules.find((rule) => rule.source === "/(.*)"));

    expect(dashboardHeaders.get("Cache-Control")).toBe(PRIVATE_NO_STORE);
    expect(apiHeaders.get("Cache-Control")).toBe(PRIVATE_NO_STORE);
    expect(globalHeaders.has("Cache-Control")).toBe(false);
  });
});
