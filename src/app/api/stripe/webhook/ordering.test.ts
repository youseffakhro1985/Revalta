import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  companyUpdateMock,
  companyFindFirstMock,
  integrationCreateMock,
  integrationFindFirstMock,
  integrationFindManyMock,
  transactionMock,
  executeRawMock,
  createLoggerMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  companyUpdateMock: vi.fn(),
  companyFindFirstMock: vi.fn(),
  integrationCreateMock: vi.fn(),
  integrationFindFirstMock: vi.fn(),
  integrationFindManyMock: vi.fn(),
  transactionMock: vi.fn(),
  executeRawMock: vi.fn(),
  createLoggerMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const transactionClient = {
    company: { update: companyUpdateMock, findFirst: companyFindFirstMock },
    integrationEvent: {
      create: integrationCreateMock,
      update: vi.fn(),
      findFirst: integrationFindFirstMock,
      findMany: integrationFindManyMock,
    },
    $executeRaw: executeRawMock,
  };
  return { default: { $transaction: transactionMock, ...transactionClient } };
});

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

function signature(payload: string, secret = "whsec_test") {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

function request(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  return new Request("https://www.revalta.se/api/stripe/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature(payload),
      "x-request-id": "550e8400-e29b-41d4-a716-446655440000",
    },
    body: payload,
  });
}

function subscriptionEvent(created: number, status: string) {
  return {
    id: `evt_${created}_${status}`,
    type: "customer.subscription.updated",
    created,
    data: {
      object: {
        id: "sub_1",
        customer: "cus_1",
        status,
        metadata: { companyId: "company-1", plan: "professional" },
      },
    },
  };
}

describe("Stripe webhook subscription ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    executeRawMock.mockResolvedValue(1);
    integrationFindFirstMock.mockResolvedValue(null);
    integrationFindManyMock.mockResolvedValue([]);
    integrationCreateMock.mockResolvedValue({});
    companyFindFirstMock.mockResolvedValue({
      id: "company-1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    });
    companyUpdateMock.mockResolvedValue({
      id: "company-1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      subscription_status: "active",
    });
    transactionMock.mockImplementation(async (callback) => callback({
      company: { update: companyUpdateMock, findFirst: companyFindFirstMock },
      integrationEvent: {
        create: integrationCreateMock,
        update: vi.fn(),
        findFirst: integrationFindFirstMock,
        findMany: integrationFindManyMock,
      },
      $executeRaw: executeRawMock,
    }));
  });

  it("journals but does not apply an older subscription event after a newer event was already received", async () => {
    integrationFindManyMock.mockResolvedValue([{
      payload: {
        eventType: "customer.subscription.updated",
        eventCreated: 200,
        objectId: "sub_1",
        customer: "cus_1",
        status: "active",
        matchedCompany: true,
      },
    }]);

    const response = await POST(request(subscriptionEvent(100, "past_due")));

    expect(response.status).toBe(200);
    expect(companyUpdateMock).not.toHaveBeenCalled();
    expect(executeRawMock).toHaveBeenCalledTimes(2);
    expect(integrationCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        type: "stripe",
        status: "received",
        payload: expect.objectContaining({
          eventCreated: 100,
          objectId: "sub_1",
          status: "past_due",
          matchedCompany: true,
          stale: true,
        }),
      }),
    }));
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "stripe webhook stale subscription event ignored",
      expect.objectContaining({ event: "stripe.webhook.stale_subscription_event" }),
    );
  });

  it("still applies a newer subscription event when only older subscription history exists", async () => {
    integrationFindManyMock.mockResolvedValue([{
      payload: {
        eventType: "customer.subscription.updated",
        eventCreated: 100,
        objectId: "sub_1",
        customer: "cus_1",
        status: "past_due",
        matchedCompany: true,
      },
    }]);

    const response = await POST(request(subscriptionEvent(200, "active")));

    expect(response.status).toBe(200);
    expect(companyUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "company-1" },
      data: expect.objectContaining({
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_1",
        subscription_status: "active",
      }),
    }));
    expect(integrationCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "received",
        payload: expect.objectContaining({ eventCreated: 200, stale: false }),
      }),
    }));
  });
});
