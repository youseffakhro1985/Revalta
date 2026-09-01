import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  createCheckoutSessionMock,
  isStripeReadyMock,
  recordPaymentEventMock,
  writeAuditLogMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  createCheckoutSessionMock: vi.fn(),
  isStripeReadyMock: vi.fn(),
  recordPaymentEventMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageBilling: (role: string) => ["owner", "admin"].includes(role),
}));
vi.mock("@/lib/stripe", () => ({
  createCheckoutSession: createCheckoutSessionMock,
  isStripeReady: isStripeReadyMock,
}));
vi.mock("@/lib/integrations", () => ({ recordPaymentEvent: recordPaymentEventMock }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function request() {
  return new Request("https://www.revalta.se/api/billing/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({ plan: "professional" }),
  });
}

function expectNoProviderSideEffects() {
  expect(isStripeReadyMock).not.toHaveBeenCalled();
  expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  expect(recordPaymentEventMock).not.toHaveBeenCalled();
  expect(writeAuditLogMock).not.toHaveBeenCalled();
}

describe("billing checkout authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });
  });

  it("returns 401 before any Stripe or telemetry work when there is no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expectNoProviderSideEffects();
  });

  it("returns 403 before any Stripe or telemetry work when the user has no company", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "owner-without-company",
      email: "owner@example.se",
      role: "owner",
      company_id: null,
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.errorCode).toBe("FORBIDDEN");
    expect(body.requestId).toBe(requestId);
    expectNoProviderSideEffects();
  });

  it("returns 403 before any Stripe or telemetry work for a role that cannot manage billing", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      email: "manager@example.se",
      role: "manager",
      company_id: "company-1",
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.errorCode).toBe("FORBIDDEN");
    expect(body.requestId).toBe(requestId);
    expectNoProviderSideEffects();
  });
});
