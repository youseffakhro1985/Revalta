import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  recordPaymentEventMock,
  isStripeReadyMock,
  createCheckoutSessionMock,
  writeAuditLogMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  recordPaymentEventMock: vi.fn(),
  isStripeReadyMock: vi.fn(),
  createCheckoutSessionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
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
  createCheckoutSession: createCheckoutSessionMock,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function request(
  body: unknown = { plan: "professional" },
  url = "https://www.revalta.se/api/billing/checkout",
  headers: Record<string, string> = {},
) {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("billing checkout", () => {
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
    writeAuditLogMock.mockResolvedValue(undefined);
    createCheckoutSessionMock.mockResolvedValue({
      id: "cs_secret_internal_123",
      url: "https://checkout.stripe.com/c/pay/cs_live_public_redirect",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a correlated private 503 in production when Stripe is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    isStripeReadyMock.mockReturnValue(false);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "Stripe är inte konfigurerad i produktion",
      errorCode: "SERVICE_UNAVAILABLE",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("keeps the production 503 even if telemetry recording fails", async () => {
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

  it("allows a correlated private mock checkout outside production", async () => {
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
      url: "https://www.revalta.se/dashboard/billing?mockCheckout=professional",
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

  it("returns a stable 400 for an invalid plan", async () => {
    vi.stubEnv("NODE_ENV", "test");
    isStripeReadyMock.mockReturnValue(true);

    const response = await POST(request({ plan: "unlimited" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Ogiltig plan", errorCode: "VALIDATION_FAILED", requestId });
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("uses Revalta's canonical production origin and a stable correlated Stripe idempotency key", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    isStripeReadyMock.mockReturnValue(true);

    const response = await POST(request(
      { plan: "enterprise" },
      "https://attacker.example/api/billing/checkout",
    ));

    expect(response.status).toBe(200);
    expect(createCheckoutSessionMock).toHaveBeenCalledWith({
      plan: "enterprise",
      customerEmail: "owner@example.se",
      companyId: "company-1",
      successUrl: "https://www.revalta.se/dashboard/billing?checkout=success&plan=enterprise",
      cancelUrl: "https://www.revalta.se/dashboard/billing?checkout=cancelled",
      idempotencyKey: `revalta-checkout:company-1:enterprise:${requestId}`,
    });
  });

  it("reuses the same Stripe idempotency key when the same correlated request is retried", async () => {
    vi.stubEnv("NODE_ENV", "test");
    isStripeReadyMock.mockReturnValue(true);

    await POST(request());
    await POST(request());

    expect(createCheckoutSessionMock).toHaveBeenCalledTimes(2);
    expect(createCheckoutSessionMock.mock.calls[0]?.[0]?.idempotencyKey).toBe(
      `revalta-checkout:company-1:professional:${requestId}`,
    );
    expect(createCheckoutSessionMock.mock.calls[1]?.[0]?.idempotencyKey).toBe(
      `revalta-checkout:company-1:professional:${requestId}`,
    );
  });

  it("minimizes post-session audit and telemetry and does not persist the Stripe session id", async () => {
    vi.stubEnv("NODE_ENV", "test");
    isStripeReadyMock.mockReturnValue(true);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({
        action: "billing.checkout_started",
        metadata: { schemaVersion: 2, plan: "professional", mode: "live" },
      }),
    );
    expect(recordPaymentEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      { plan: "professional", mode: "checkout", sessionCreated: true },
    );
    expect(JSON.stringify(writeAuditLogMock.mock.calls)).not.toContain("cs_secret_internal_123");
    expect(JSON.stringify(recordPaymentEventMock.mock.calls)).not.toContain("cs_secret_internal_123");
  });

  it("returns the live session even if post-session audit and telemetry fail", async () => {
    vi.stubEnv("NODE_ENV", "test");
    isStripeReadyMock.mockReturnValue(true);
    writeAuditLogMock.mockRejectedValue(new Error("audit-secret"));
    recordPaymentEventMock.mockRejectedValue(new Error("telemetry-secret"));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      mode: "live",
      url: "https://checkout.stripe.com/c/pay/cs_live_public_redirect",
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "billing checkout audit failed",
      expect.objectContaining({ event: "billing.checkout.audit_failed", companyId: "company-1", plan: "professional" }),
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "billing checkout telemetry failed",
      expect.objectContaining({ event: "billing.checkout.telemetry_failed", phase: "live" }),
    );
    const logs = JSON.stringify([
      loggerInfoMock.mock.calls,
      loggerWarnMock.mock.calls,
      loggerErrorMock.mock.calls,
    ]);
    expect(logs).not.toContain("owner@example.se");
    expect(logs).not.toContain("cs_secret_internal_123");
    expect(logs).not.toContain("audit-secret");
    expect(logs).not.toContain("telemetry-secret");
  });

  it("returns a safe correlated 500 if Stripe session creation fails", async () => {
    vi.stubEnv("NODE_ENV", "test");
    isStripeReadyMock.mockReturnValue(true);
    createCheckoutSessionMock.mockRejectedValue(new Error("sk_live_secret_should_never_leak"));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("sk_live_secret_should_never_leak");
  });
});
