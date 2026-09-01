import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  companyUpdateMock,
  companyFindFirstMock,
  integrationCreateMock,
  integrationUpdateMock,
  integrationFindFirstMock,
  transactionMock,
  executeRawMock,
  createLoggerMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  companyUpdateMock: vi.fn(),
  companyFindFirstMock: vi.fn(),
  integrationCreateMock: vi.fn(),
  integrationUpdateMock: vi.fn(),
  integrationFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
  executeRawMock: vi.fn(),
  createLoggerMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const transactionClient = {
    company: { update: companyUpdateMock, findFirst: companyFindFirstMock },
    integrationEvent: {
      create: integrationCreateMock,
      update: integrationUpdateMock,
      findFirst: integrationFindFirstMock,
    },
    $executeRaw: executeRawMock,
  };
  return { default: { $transaction: transactionMock, ...transactionClient } };
});
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function signature(payload: string, secret = "whsec_test") {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

function webhookRequest(payload: string, stripeSignature?: string) {
  return new Request("https://www.revalta.se/api/stripe/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      ...(stripeSignature ? { "stripe-signature": stripeSignature } : {}),
    },
    body: payload,
  });
}

describe("Stripe webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    companyUpdateMock.mockResolvedValue({ id: "company-1" });
    integrationCreateMock.mockResolvedValue({});
    integrationUpdateMock.mockResolvedValue({});
    integrationFindFirstMock.mockResolvedValue(null);
    executeRawMock.mockResolvedValue(1);
    companyFindFirstMock.mockResolvedValue(null);
    transactionMock.mockImplementation(async (callback) => callback({
      company: { update: companyUpdateMock, findFirst: companyFindFirstMock },
      integrationEvent: {
        create: integrationCreateMock,
        update: integrationUpdateMock,
        findFirst: integrationFindFirstMock,
      },
      $executeRaw: executeRawMock,
    }));
  });

  it("returns a correlated safe 400 for an invalid signature without logging signature or payload", async () => {
    const payload = JSON.stringify({ id: "evt_signature_1", type: "customer.subscription.updated" });
    const suppliedSignature = "t=123,v1=attacker-controlled-signature";
    const response = await POST(webhookRequest(payload, suppliedSignature));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "Ogiltig Stripe-signatur",
      errorCode: "VALIDATION_FAILED",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(transactionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "stripe webhook signature rejected",
      expect.objectContaining({ event: "stripe.webhook.signature_invalid" }),
    );
    const logs = JSON.stringify(loggerWarnMock.mock.calls);
    expect(logs).not.toContain(suppliedSignature);
    expect(logs).not.toContain(payload);
  });

  it("returns a correlated safe 400 for malformed JSON with a valid signature", async () => {
    const payload = "{not-json";
    const response = await POST(webhookRequest(payload, signature(payload)));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("VALIDATION_FAILED");
    expect(body.requestId).toBe(requestId);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "stripe webhook payload rejected",
      expect.objectContaining({ event: "stripe.webhook.payload_invalid" }),
    );
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain(payload);
  });

  it("returns a correlated safe 400 for signed events without a valid Stripe event id", async () => {
    const payload = JSON.stringify({ type: "customer.subscription.updated", data: { object: {} } });
    const response = await POST(webhookRequest(payload, signature(payload)));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("VALIDATION_FAILED");
    expect(body.requestId).toBe(requestId);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "stripe webhook payload rejected",
      expect.objectContaining({ event: "stripe.webhook.payload_invalid" }),
    );
  });

  it("rejects a supported signed event that is missing its Stripe object", async () => {
    const payload = JSON.stringify({ id: "evt_missing_object_1", type: "customer.subscription.updated", data: {} });
    const response = await POST(webhookRequest(payload, signature(payload)));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("VALIDATION_FAILED");
    expect(transactionMock).not.toHaveBeenCalled();
    expect(integrationCreateMock).not.toHaveBeenCalled();
  });

  it("binds checkout completion without writing checkout status as subscription status", async () => {
    companyFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "company-1", stripe_customer_id: null, stripe_subscription_id: null });

    const payload = JSON.stringify({
      id: "evt_checkout_1",
      type: "checkout.session.completed",
      created: 1788294000,
      data: {
        object: {
          id: "cs_1",
          customer: "cus_1",
          subscription: "sub_1",
          status: "complete",
          metadata: { companyId: "company-1", plan: "professional" },
        },
      },
    });
    const response = await POST(webhookRequest(payload, signature(payload)));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(companyUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "company-1" },
      data: {
        plan: "professional",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_1",
      },
    }));
    expect(integrationCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        status: "received",
        payload: expect.objectContaining({ eventCreated: 1788294000, replayCount: 0 }),
      }),
    }));
    expect(executeRawMock).toHaveBeenCalled();
    expect(integrationFindFirstMock).toHaveBeenCalledWith({
      where: { type: "stripe", recipient: "evt_checkout_1" },
      select: { id: true, status: true, payload: true },
    });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "stripe webhook received",
      expect.objectContaining({
        event: "stripe.webhook.received",
        stripeEventId: "evt_checkout_1",
        stripeEventType: "checkout.session.completed",
      }),
    );
  });

  it("does not use a Checkout Session id as a subscription id when Stripe has not supplied one", async () => {
    companyFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "company-1", stripe_customer_id: "cus_1", stripe_subscription_id: null });

    const payload = JSON.stringify({
      id: "evt_checkout_without_subscription",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          customer: "cus_1",
          status: "complete",
          metadata: { companyId: "company-1", plan: "start" },
        },
      },
    });
    const response = await POST(webhookRequest(payload, signature(payload)));

    expect(response.status).toBe(200);
    expect(companyUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        plan: "start",
        stripe_customer_id: "cus_1",
      },
    }));
  });

  it("lets subscription events own subscription_status", async () => {
    companyFindFirstMock.mockResolvedValueOnce({
      id: "company-1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    });

    const payload = JSON.stringify({
      id: "evt_subscription_active_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          metadata: { companyId: "company-1", plan: "enterprise" },
        },
      },
    });
    const response = await POST(webhookRequest(payload, signature(payload)));

    expect(response.status).toBe(200);
    expect(companyUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        plan: "enterprise",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_1",
        subscription_status: "active",
      }),
    }));
  });

  it("journals invoice payment events without overwriting subscription status with invoice status", async () => {
    companyFindFirstMock.mockResolvedValueOnce({
      id: "company-1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    });

    const payload = JSON.stringify({
      id: "evt_invoice_paid_1",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_1",
          customer: "cus_1",
          subscription: "sub_1",
          status: "paid",
        },
      },
    });
    const response = await POST(webhookRequest(payload, signature(payload)));

    expect(response.status).toBe(200);
    expect(companyUpdateMock).not.toHaveBeenCalled();
    expect(integrationCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        status: "received",
        recipient: "evt_invoice_paid_1",
      }),
    }));
  });

  it("preserves tenant-safe metadata mismatch behavior", async () => {
    companyFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "company-1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" });

    const payload = JSON.stringify({
      id: "evt_subscription_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          metadata: { companyId: "company-other", plan: "professional" },
        },
      },
    });
    const response = await POST(webhookRequest(payload, signature(payload)));

    expect(response.status).toBe(200);
    expect(companyUpdateMock).not.toHaveBeenCalled();
    expect(integrationCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ignored" }),
    }));
  });

  it("re-evaluates a previously ignored event in the same journal row when the Stripe mapping later exists", async () => {
    integrationFindFirstMock.mockResolvedValue({
      id: "integration-event-ignored",
      status: "ignored",
      payload: { replayCount: 1 },
    });
    companyFindFirstMock.mockResolvedValueOnce({
      id: "company-1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    });

    const payload = JSON.stringify({
      id: "evt_replay_1",
      type: "customer.subscription.updated",
      created: 1788294100,
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          metadata: { companyId: "company-1", plan: "professional" },
        },
      },
    });
    const response = await POST(webhookRequest(payload, signature(payload)));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(companyUpdateMock).toHaveBeenCalled();
    expect(integrationCreateMock).not.toHaveBeenCalled();
    expect(integrationUpdateMock).toHaveBeenCalledWith({
      where: { id: "integration-event-ignored" },
      data: expect.objectContaining({
        company_id: "company-1",
        status: "received",
        payload: expect.objectContaining({
          matchedCompany: true,
          replayCount: 2,
          eventCreated: 1788294100,
        }),
      }),
    });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "stripe webhook replay evaluated",
      expect.objectContaining({
        event: "stripe.webhook.replayed",
        stripeEventId: "evt_replay_1",
        matchedCompany: true,
      }),
    );
  });

  it("keeps an unresolved replay ignored instead of creating duplicate journal rows", async () => {
    integrationFindFirstMock.mockResolvedValue({
      id: "integration-event-ignored",
      status: "ignored",
      payload: { replayCount: 0 },
    });
    companyFindFirstMock.mockResolvedValue(null);

    const payload = JSON.stringify({
      id: "evt_replay_unmatched_1",
      type: "invoice.payment_failed",
      data: { object: { id: "in_1", customer: "cus_missing", subscription: "sub_missing", status: "open" } },
    });
    const response = await POST(webhookRequest(payload, signature(payload)));

    expect(response.status).toBe(200);
    expect(integrationCreateMock).not.toHaveBeenCalled();
    expect(integrationUpdateMock).toHaveBeenCalledWith({
      where: { id: "integration-event-ignored" },
      data: expect.objectContaining({
        company_id: null,
        status: "ignored",
        payload: expect.objectContaining({ replayCount: 1, matchedCompany: false }),
      }),
    });
  });

  it("acknowledges completed duplicate deliveries idempotently and correlates the response", async () => {
    integrationFindFirstMock.mockResolvedValue({ id: "integration-event-1", status: "received", payload: {} });
    const payload = JSON.stringify({
      id: "evt_duplicate_1",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", customer: "cus_1", status: "active" } },
    });
    const response = await POST(webhookRequest(payload, signature(payload)));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: true });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(companyUpdateMock).not.toHaveBeenCalled();
    expect(integrationCreateMock).not.toHaveBeenCalled();
    expect(integrationUpdateMock).not.toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "stripe webhook duplicate acknowledged",
      expect.objectContaining({ event: "stripe.webhook.duplicate", stripeEventId: "evt_duplicate_1" }),
    );
  });

  it("returns correlated 500 for a database failure instead of misclassifying it as invalid payload", async () => {
    const payload = JSON.stringify({
      id: "evt_db_failure_1",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", customer: "cus_1", status: "active" } },
    });
    transactionMock.mockRejectedValue(new Error("postgres://user:super-secret@db.internal/revalta"));

    const response = await POST(webhookRequest(payload, signature(payload)));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "stripe webhook failed",
      expect.any(Error),
      expect.objectContaining({
        event: "stripe.webhook.failed",
        stripeEventId: "evt_db_failure_1",
        stripeEventType: "customer.subscription.updated",
      }),
    );
    expect(JSON.stringify(body)).not.toContain("postgres://");
  });
});
