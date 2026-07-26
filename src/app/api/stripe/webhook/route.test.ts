import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { companyUpdateMock, integrationCreateMock } = vi.hoisted(() => ({
  companyUpdateMock: vi.fn(),
  integrationCreateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    company: { update: companyUpdateMock },
    integrationEvent: { create: integrationCreateMock },
  },
}));

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

  it("processes checkout completion with verified signature", async () => {
    const payload = JSON.stringify({
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
  });
});
