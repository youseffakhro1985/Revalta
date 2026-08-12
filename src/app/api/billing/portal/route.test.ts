import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, recordPaymentEventMock, isStripeReadyMock, createCustomerPortalSessionMock, dbFindUniqueMock } =
  vi.hoisted(() => ({
    getCurrentUserMock: vi.fn(),
    recordPaymentEventMock: vi.fn(),
    isStripeReadyMock: vi.fn(),
    createCustomerPortalSessionMock: vi.fn(),
    dbFindUniqueMock: vi.fn(),
  }));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageBilling: (role: string) => ["owner", "admin"].includes(role),
}));
vi.mock("@/lib/integrations", () => ({ recordPaymentEvent: recordPaymentEventMock }));
vi.mock("@/lib/stripe", () => ({
  isStripeReady: isStripeReadyMock,
  createCustomerPortalSession: createCustomerPortalSessionMock,
}));
vi.mock("@/lib/db", () => ({
  default: { company: { findUnique: dbFindUniqueMock } },
}));

import { POST } from "./route";

describe("billing portal fail-closed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      email: "owner@example.se",
      role: "owner",
      company_id: "company-1",
    });
    recordPaymentEventMock.mockResolvedValue({});
    dbFindUniqueMock.mockResolvedValue({ stripe_customer_id: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 in production when Stripe/customer is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    isStripeReadyMock.mockReturnValue(false);

    const response = await POST(new Request("https://www.revalta.se/api/billing/portal", { method: "POST" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Stripe-kundportal är inte tillgänglig i produktion",
    });
  });

  it("allows mock portal outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    isStripeReadyMock.mockReturnValue(false);

    const response = await POST(new Request("https://www.revalta.se/api/billing/portal", { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, mode: "mock" });
  });

  it("still returns 503 in production even when ALLOW_INTEGRATION_MOCKS=1 is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ALLOW_INTEGRATION_MOCKS", "1");
    isStripeReadyMock.mockReturnValue(false);

    const response = await POST(new Request("https://www.revalta.se/api/billing/portal", { method: "POST" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Stripe-kundportal är inte tillgänglig i produktion",
    });
  });
});
