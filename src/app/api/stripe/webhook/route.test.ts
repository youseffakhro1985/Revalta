import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  companyUpdateMock,
  companyFindFirstMock,
  integrationCreateMock,
  transactionMock,
  webhookReceiptCreateMock,
  webhookReceiptUpdateMock,
} = vi.hoisted(() => ({
  companyUpdateMock: vi.fn(),
  companyFindFirstMock: vi.fn(),
  integrationCreateMock: vi.fn(),
  transactionMock: vi.fn(),
  webhookReceiptCreateMock: vi.fn(),
  webhookReceiptUpdateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const transactionClient = {
    company: { update: companyUpdateMock, findFirst: companyFindFirstMock },
    integrationEvent: { create: integrationCreateMock },
    webhookReceipt: { create: webhookReceiptCreateMock, update: webhookReceiptUpdateMock },
  };
  return { default: { $transaction: transactionMock, ...transactionClient } };
});

import { POST } from "./route";

function signature(payload: string, secret = "whsec_test") {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

describe("Stripe webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    companyUpdateMock.mockResolvedValue({ id: "company-1" });
    integrationCreateMock.mockResolvedValue({});
    webhookReceiptCreateMock.mockResolvedValue({});
    webhookReceiptUpdateMock.mockResolvedValue({});
    companyFindFirstMock.mockResolvedValue(null);
    transactionMock.mockImplementation(async (callback) => callback({
      company: { update: companyUpdateMock, findFirst: companyFindFirstMock },
      integrationEvent: { create: integrationCreateMock },
      webhookReceipt: { create: webhookReceiptCreateMock, update: webhookReceiptUpdateMock },
    }));
  });

  it("rejects missing signatures", async () => {
    const response = await POST(new Request("https://www.revalta.se/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({ id: "evt_1" }),
    }));

    expect(response.status).toBe(400);
    expect(companyUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON with a valid signature", async () => {
    const payload = "{not-json";
    const response = await POST(new Request("https://www.revalta.se/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature(payload) },
      body: payload,
    }));

    expect(response.status).toBe(400);
    expect(companyUpdateMock).not.toHaveBeenCalled();
  });

  it("binds checkout completion via metadata when Stripe ids are unmapped", async () => {
    companyFindFirstMock
      .mockResolvedValueOnce(null) // subscription lookup
      .mockResolvedValueOnce(null) // customer lookup
      .mockResolvedValueOnce({ id: "company-1", stripe_customer_id: null, stripe_subscription_id: null });

    const payload = JSON.stringify({
      id: "evt_checkout_1",
      type: "checkout.session.completed",
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
    const response = await POST(new Request("https://www.revalta.se/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature(payload) },
      body: payload,
    }));

    expect(response.status).toBe(200);
    expect(companyUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "company-1" },
      data: expect.objectContaining({
        plan: "professional",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_1",
      }),
    }));
    expect(integrationCreateMock).toHaveBeenCalled();
    expect(webhookReceiptCreateMock).toHaveBeenCalledWith({
      data: { provider: "stripe", event_id: "evt_checkout_1", event_type: "checkout.session.completed" },
    });
    expect(webhookReceiptUpdateMock).toHaveBeenCalled();
  });

  it("rejects metadata company mismatch against mapped Stripe customer", async () => {
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
    const response = await POST(new Request("https://www.revalta.se/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature(payload) },
      body: payload,
    }));

    expect(response.status).toBe(200);
    expect(companyUpdateMock).not.toHaveBeenCalled();
    expect(integrationCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ignored" }),
    }));
  });

  it("rejects signed events without a Stripe event id", async () => {
    const payload = JSON.stringify({ type: "customer.subscription.updated", data: { object: {} } });
    const response = await POST(new Request("https://www.revalta.se/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature(payload) },
      body: payload,
    }));

    expect(response.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
