import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  recordPaymentEventMock,
  isStripeReadyMock,
  createCustomerPortalSessionMock,
  dbFindUniqueMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  recordPaymentEventMock: vi.fn(),
  isStripeReadyMock: vi.fn(),
  createCustomerPortalSessionMock: vi.fn(),
  dbFindUniqueMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
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
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function request(
  url = "https://www.revalta.se/api/billing/portal",
  headers: Record<string, string> = {},
) {
  return new Request(url, {
    method: "POST",
    headers: { "x-request-id": requestId, ...headers },
  });
}

describe("billing portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      email: "owner@example.se",
      role: "owner",
      company_id: "company-1",
    });
    recordPaymentEventMock.mockResolvedValue({});
    dbFindUniqueMock.mockResolvedValue({ stripe_customer_id: null });
    createCustomerPortalSessionMock.mockResolvedValue({
      id: "bps_secret_internal_123",
      url: "https://billing.stripe.com/p/session/live_public_redirect",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a correlated private 503 in production when Stripe/customer is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    isStripeReadyMock.mockReturnValue(false);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "Stripe-kundportal är inte tillgänglig i produktion",
      errorCode: "SERVICE_UNAVAILABLE",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("keeps the production 503 even if unavailable telemetry fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    isStripeReadyMock.mockReturnValue(false);
    recordPaymentEventMock.mockRejectedValue(new Error("integration-db-secret"));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.errorCode).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("integration-db-secret");
  });

  it("allows a correlated private mock portal outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    isStripeReadyMock.mockReturnValue(false);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({
      success: true,
      mode: "mock",
      url: "https://www.revalta.se/dashboard/billing?mockPortal=true",
    });
  });

  it("still returns 503 in production even when ALLOW_INTEGRATION_MOCKS=1 is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ALLOW_INTEGRATION_MOCKS", "1");
    isStripeReadyMock.mockReturnValue(false);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect((await response.json()).errorCode).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns a stable 403 before reading Stripe customer data for a disallowed role", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", role: "manager", company_id: "company-1" });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "Du saknar behörighet att öppna kundportal",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(dbFindUniqueMock).not.toHaveBeenCalled();
  });

  it("uses Revalta's canonical production origin even when the request host is untrusted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    isStripeReadyMock.mockReturnValue(true);
    dbFindUniqueMock.mockResolvedValue({ stripe_customer_id: "cus_verified_internal_123" });

    const response = await POST(request("https://attacker.example/api/billing/portal"));

    expect(response.status).toBe(200);
    expect(createCustomerPortalSessionMock).toHaveBeenCalledWith({
      customerId: "cus_verified_internal_123",
      returnUrl: "https://www.revalta.se/dashboard/billing",
    });
  });

  it("returns the live portal session even if post-session telemetry fails", async () => {
    vi.stubEnv("NODE_ENV", "test");
    isStripeReadyMock.mockReturnValue(true);
    dbFindUniqueMock.mockResolvedValue({ stripe_customer_id: "cus_verified_internal_123" });
    recordPaymentEventMock.mockRejectedValue(new Error("telemetry-secret"));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      mode: "live",
      url: "https://billing.stripe.com/p/session/live_public_redirect",
    });
    expect(recordPaymentEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      { mode: "customer_portal", sessionCreated: true },
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "billing portal telemetry failed",
      expect.objectContaining({ event: "billing.portal.telemetry_failed", phase: "live", companyId: "company-1" }),
    );
    const logs = JSON.stringify([
      loggerInfoMock.mock.calls,
      loggerWarnMock.mock.calls,
      loggerErrorMock.mock.calls,
    ]);
    expect(logs).not.toContain("owner@example.se");
    expect(logs).not.toContain("cus_verified_internal_123");
    expect(logs).not.toContain("bps_secret_internal_123");
    expect(logs).not.toContain("telemetry-secret");
  });

  it("returns a safe correlated 500 if Stripe portal session creation fails", async () => {
    vi.stubEnv("NODE_ENV", "test");
    isStripeReadyMock.mockReturnValue(true);
    dbFindUniqueMock.mockResolvedValue({ stripe_customer_id: "cus_verified_internal_123" });
    createCustomerPortalSessionMock.mockRejectedValue(new Error("sk_live_secret_should_never_leak"));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("sk_live_secret_should_never_leak");
  });
});
