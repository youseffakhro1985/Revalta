import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  propertyCountMock,
  userCountMock,
  ticketCountMock,
  companyFindUniqueMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyCountMock: vi.fn(),
  userCountMock: vi.fn(),
  ticketCountMock: vi.fn(),
  companyFindUniqueMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

vi.mock("@/lib/db", () => ({
  default: {
    property: { count: propertyCountMock },
    user: { count: userCountMock },
    ticket: { count: ticketCountMock },
    company: { findUnique: companyFindUniqueMock },
  },
}));

import { GET } from "./route";

function request() {
  return new Request("https://www.revalta.se/api/billing", {
    headers: { "x-request-id": "550e8400-e29b-41d4-a716-446655440000" },
  });
}

describe("billing Stripe readiness contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
      company_id: "company-1",
      role: "owner",
      company: { plan: "professional" },
    });
    propertyCountMock.mockResolvedValue(2);
    userCountMock.mockResolvedValue(3);
    ticketCountMock.mockResolvedValue(4);
    companyFindUniqueMock.mockResolvedValue({
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "active",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports every plan and the portal ready when all Stripe configuration exists", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_123");
    vi.stubEnv("STRIPE_PRICE_START", "price_start");
    vi.stubEnv("STRIPE_PRICE_PROFESSIONAL", "price_standard");
    vi.stubEnv("STRIPE_PRICE_ENTERPRISE", "price_professional");

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stripeConfigured).toBe(true);
    expect(body.stripePlanReadiness).toEqual({
      start: true,
      professional: true,
      enterprise: true,
    });
    expect(body.stripePortalReady).toBe(true);
  });

  it("keeps configured plans usable when another plan price is missing", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_123");
    vi.stubEnv("STRIPE_PRICE_START", "price_start");
    vi.stubEnv("STRIPE_PRICE_PROFESSIONAL", "price_standard");
    vi.stubEnv("STRIPE_PRICE_ENTERPRISE", "");

    const response = await GET(request());
    const body = await response.json();

    expect(body.stripeConfigured).toBe(false);
    expect(body.stripePlanReadiness).toEqual({
      start: true,
      professional: true,
      enterprise: false,
    });
    expect(body.stripePortalReady).toBe(true);
  });

  it("reports portal unavailable when the company has no Stripe customer id", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_123");
    vi.stubEnv("STRIPE_PRICE_START", "price_start");
    vi.stubEnv("STRIPE_PRICE_PROFESSIONAL", "price_standard");
    vi.stubEnv("STRIPE_PRICE_ENTERPRISE", "price_professional");
    companyFindUniqueMock.mockResolvedValue({
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_status: null,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(body.stripeConfigured).toBe(true);
    expect(body.stripePortalReady).toBe(false);
  });
});
