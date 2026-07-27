import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPortalTrackingToken,
  extractPortalTrackingToken,
  verifyPortalTrackingToken,
} from "@/lib/portal-tracking";

describe("portal tracking tokens", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", "test-jwt-secret-with-at-least-32-chars");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("creates a verifiable token for reference, email and company", () => {
    const token = createPortalTrackingToken({
      reference: "rv-2026-abc123",
      email: "Boende@Example.se",
      companyId: " company-1 ",
    });

    expect(verifyPortalTrackingToken(token)).toEqual({
      reference: "RV-2026-ABC123",
      email: "boende@example.se",
      companyId: "company-1",
      exp: expect.any(Number),
    });
  });

  it("rejects tampered tokens", () => {
    const token = createPortalTrackingToken({
      reference: "RV-2026-ABC123",
      email: "boende@example.se",
      companyId: "company-1",
    });
    const [body] = token.split(".");
    expect(verifyPortalTrackingToken(`${body}.invalid-signature`)).toBeNull();
  });

  it("rejects tokens with extra segments or invalid base64url", () => {
    const token = createPortalTrackingToken({
      reference: "RV-2026-ABC123",
      email: "boende@example.se",
      companyId: "company-1",
    });

    expect(verifyPortalTrackingToken(`${token}.extra`)).toBeNull();
    expect(verifyPortalTrackingToken("not+base64url.signature")).toBeNull();
  });

  it("rejects expired tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T20:00:00.000Z"));

    const token = createPortalTrackingToken({
      reference: "RV-2026-ABC123",
      email: "boende@example.se",
      companyId: "company-1",
      ttlMs: 1_000,
    });

    vi.advanceTimersByTime(1_001);
    expect(verifyPortalTrackingToken(token)).toBeNull();
  });

  it("rejects invalid input and excessive TTL", () => {
    expect(() => createPortalTrackingToken({
      reference: "RV|INJECTED",
      email: "boende@example.se",
      companyId: "company-1",
    })).toThrow("Invalid portal tracking token input");

    expect(() => createPortalTrackingToken({
      reference: "RV-2026-ABC123",
      email: "invalid-email",
      companyId: "company-1",
    })).toThrow("Invalid portal tracking token input");

    expect(() => createPortalTrackingToken({
      reference: "RV-2026-ABC123",
      email: "boende@example.se",
      companyId: "company-1",
      ttlMs: 1000 * 60 * 60 * 24 * 91,
    })).toThrow("Invalid portal tracking token input");
  });

  it("rejects oversized tokens before decoding", () => {
    expect(verifyPortalTrackingToken("a".repeat(2_049))).toBeNull();
  });

  it("extracts tokens with header priority, then query and form data", () => {
    const request = new Request("https://www.revalta.se/api/public/tickets/RV-1?token=query-token");
    expect(extractPortalTrackingToken(request)).toBe("query-token");

    const headerRequest = new Request("https://www.revalta.se/api/public/tickets/RV-1?token=query-token", {
      headers: { "x-portal-tracking-token": "header-token" },
    });
    expect(extractPortalTrackingToken(headerRequest)).toBe("header-token");

    const formData = new FormData();
    formData.append("token", "form-token");
    expect(extractPortalTrackingToken(new Request("https://www.revalta.se"), formData)).toBe("form-token");
  });

  it("ignores oversized extracted tokens", () => {
    const oversized = "a".repeat(2_049);
    const request = new Request(`https://www.revalta.se/api/public/tickets/RV-1?token=${oversized}`);
    expect(extractPortalTrackingToken(request)).toBeNull();
  });

  it("fails closed when no tracking secret is configured", () => {
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("PORTAL_TRACKING_SECRET", "");

    expect(verifyPortalTrackingToken("body.signature")).toBeNull();
    expect(() => createPortalTrackingToken({
      reference: "RV-2026-ABC123",
      email: "boende@example.se",
      companyId: "company-1",
    })).toThrow("Portal tracking secret is not configured");
  });
});
