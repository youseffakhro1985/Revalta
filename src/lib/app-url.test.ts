import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicAppUrl } from "./app-url";

describe("getPublicAppUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the canonical production origin when configuration is absent", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(getPublicAppUrl("https://attacker.example/request")).toBe("https://www.revalta.se");
  });

  it("normalizes a configured application URL to its origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.revalta.se/some/path/");

    expect(getPublicAppUrl()).toBe("https://www.revalta.se");
  });

  it("rejects insecure production configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://www.revalta.se");

    expect(() => getPublicAppUrl()).toThrow("must use HTTPS");
  });

  it("allows the request origin only outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(getPublicAppUrl("http://localhost:3000/register")).toBe("http://localhost:3000");
  });
});
