import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPortalTrackUrl, portalHomeUrl } from "./portal-track-url";
import { verifyPortalTrackingToken } from "./portal-tracking";

describe("portal-track-url", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", "test-jwt-secret-with-at-least-32-chars");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.revalta.se");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds a signed portal URL and keeps SMS free of the token", () => {
    const result = buildPortalTrackUrl({
      reference: "rv-12",
      email: "anna@example.se",
      companyId: "company-1",
      feedback: true,
    });

    expect(portalHomeUrl()).toBe("https://www.revalta.se/portal");
    expect(result.reference).toBe("RV-12");
    expect(result.hasToken).toBe(true);
    expect(result.url).toContain("https://www.revalta.se/portal?ref=RV-12&token=");
    expect(result.url).toContain("feedback=1");
    expect(result.smsSafeUrl).toBe("https://www.revalta.se/portal?ref=RV-12&feedback=1");
    expect(result.smsSafeUrl).not.toContain("token=");

    const token = new URL(result.url).searchParams.get("token");
    expect(verifyPortalTrackingToken(token)).toMatchObject({
      reference: "RV-12",
      email: "anna@example.se",
      companyId: "company-1",
    });
  });

  it("falls back to a token-free URL when email or company is missing", () => {
    const result = buildPortalTrackUrl({ reference: "RV-12", email: "not-an-email" });
    expect(result.hasToken).toBe(false);
    expect(result.url).toBe("https://www.revalta.se/portal?ref=RV-12");
    expect(result.smsSafeUrl).toBe(result.url);
  });
});
