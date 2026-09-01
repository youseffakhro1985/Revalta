import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  createCustomerPortalSessionMock,
  isStripeReadyMock,
  recordPaymentEventMock,
  dbFindUniqueMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  createCustomerPortalSessionMock: vi.fn(),
  isStripeReadyMock: vi.fn(),
  recordPaymentEventMock: vi.fn(),
  dbFindUniqueMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageBilling: (role: string) => ["owner", "admin"].includes(role),
}));
vi.mock("@/lib/stripe", () => ({
  createCustomerPortalSession: createCustomerPortalSessionMock,
  isStripeReady: isStripeReadyMock,
}));
vi.mock("@/lib/integrations", () => ({ recordPaymentEvent: recordPaymentEventMock }));
vi.mock("@/lib/db", () => ({
  default: { company: { findUnique: dbFindUniqueMock } },
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function request() {
  return new Request("https://www.revalta.se/api/billing/portal", {
    method: "POST",
    headers: { "x-request-id": requestId },
  });
}

function expectNoProviderSideEffects() {
  expect(dbFindUniqueMock).not.toHaveBeenCalled();
  expect(isStripeReadyMock).not.toHaveBeenCalled();
  expect(createCustomerPortalSessionMock).not.toHaveBeenCalled();
  expect(recordPaymentEventMock).not.toHaveBeenCalled();
}

describe("billing portal authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });
  });

  it("returns 401 before company lookup or Stripe work when there is no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expectNoProviderSideEffects();
  });

  it("returns 403 before company lookup or Stripe work when the user has no company", async () => {
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
});
