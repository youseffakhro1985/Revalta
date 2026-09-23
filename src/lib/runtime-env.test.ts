import { afterEach, describe, expect, it, vi } from "vitest";
import { allowIntegrationMocks, isProductionRuntime } from "@/lib/runtime-env";

describe("runtime env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats NODE_ENV=production as production runtime", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    expect(isProductionRuntime()).toBe(true);
    expect(allowIntegrationMocks()).toBe(false);
  });

  it("does not treat Vercel Preview as production even when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isProductionRuntime()).toBe(false);
    expect(allowIntegrationMocks()).toBe(true);
  });

  it("treats Vercel Production as production even if NODE_ENV is unset", () => {
    vi.stubEnv("NODE_ENV", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isProductionRuntime()).toBe(true);
    expect(allowIntegrationMocks()).toBe(false);
  });

  it("allows mocks outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    expect(isProductionRuntime()).toBe(false);
    expect(allowIntegrationMocks()).toBe(true);
  });

  it("allows an explicit override even in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_INTEGRATION_MOCKS", "1");
    expect(allowIntegrationMocks()).toBe(true);
  });
});
