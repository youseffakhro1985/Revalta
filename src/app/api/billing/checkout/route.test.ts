import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  recordPaymentEventMock,
  isStripeReadyMock,
  createCheckoutSessionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  recordPaymentEventMock: vi.fn(),
  isStripeReadyMock: vi.fn(),
  createCheckoutSessionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageBilling: (role: string) => ["owner", "admin"].includes(role),
}));
vi.mock("@/lib/integrations", () => ({ recordPaymentEvent: recordPaymentEventMock }));
vi.mock("@/lib/stripe", () => ({
  isStripeReady: isStripeReadyMock,
  createCheckoutSession: createCheckoutSessionMock,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

import { POST } from "./route";

describe("billing checkout fail-closed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      email: "owner@example.se",
      role: "owner",
      company_id: "company-1",
    });
    recordPaymentEventMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 in production when Stripe is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    isStripeReadyMock.mockReturnValue(false);

    const response = await POST(
      new Request("https://www.revalta.se/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan: "professional" }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Stripe är inte konfigurerad i produktion",
    });
  });

  it("allows mock checkout outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    isStripeReadyMock.mockReturnValue(false);

    const response = await POST(
      new Request("https://www.revalta.se/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan: "professional" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, mode: "mock" });
  });
});
