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
    vi.unstubAllEnvs();
  });

  it("creates a verifiable token for reference, email and company", () => {
    const token = createPortalTrackingToken({
      reference: "rv-2026-abc123",
      email: "Boende@Example.se",
      companyId: "company-1",
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

  it("extracts tokens from query, header and form data", () => {
    const request = new Request("https://www.revalta.se/api/public/tickets/RV-1?token=query-token");
    expect(extractPortalTrackingToken(request)).toBe("query-token");

    const headerRequest = new Request("https://www.revalta.se/api/public/tickets/RV-1", {
      headers: { "x-portal-tracking-token": "header-token" },
    });
    expect(extractPortalTrackingToken(headerRequest)).toBe("header-token");

    const formData = new FormData();
    formData.append("token", "form-token");
    expect(extractPortalTrackingToken(new Request("https://www.revalta.se"), formData)).toBe("form-token");
  });
});
