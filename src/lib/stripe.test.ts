import { createHmac } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

function sign(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("verifyStripeSignature", () => {
  it("accepts a valid signature", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const { verifyStripeSignature } = await import("@/lib/stripe");
    const payload = JSON.stringify({ id: "evt_1" });
    expect(verifyStripeSignature(payload, sign(payload, "whsec_test"))).toBe(true);
  });

  it("accepts one of multiple valid v1 signatures", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const { verifyStripeSignature } = await import("@/lib/stripe");
    const payload = JSON.stringify({ id: "evt_1" });
    const timestamp = Math.floor(Date.now() / 1000);
    const valid = sign(payload, "whsec_test", timestamp).split("v1=")[1];
    expect(verifyStripeSignature(payload, `t=${timestamp},v1=bad,v1=${valid}`)).toBe(true);
  });

  it("rejects old timestamps", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const { verifyStripeSignature } = await import("@/lib/stripe");
    const payload = JSON.stringify({ id: "evt_1" });
    const oldTimestamp = Math.floor(Date.now() / 1000) - 1000;
    expect(verifyStripeSignature(payload, sign(payload, "whsec_test", oldTimestamp))).toBe(false);
  });
});

describe("Stripe POST idempotency", () => {
  it("forwards the checkout idempotency key to Stripe without changing the form payload", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_secret");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_PRICE_PROFESSIONAL", "price_professional");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();

    const { createCheckoutSession } = await import("@/lib/stripe");
    await createCheckoutSession({
      plan: "professional",
      customerEmail: "owner@example.se",
      companyId: "company-1",
      successUrl: "https://www.revalta.se/dashboard/billing?checkout=success",
      cancelUrl: "https://www.revalta.se/dashboard/billing?checkout=cancelled",
      idempotencyKey: "revalta-checkout:company-1:professional:req-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      Authorization: "Bearer sk_test_secret",
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": "revalta-checkout:company-1:professional:req-1",
    });
    const body = options.body as URLSearchParams;
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("line_items[0][price]")).toBe("price_professional");
    expect(body.get("metadata[companyId]")).toBe("company-1");
    expect(body.get("metadata[plan]")).toBe("professional");
  });
});
