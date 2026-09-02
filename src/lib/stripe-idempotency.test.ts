import { afterEach, describe, expect, it, vi } from "vitest";

const checkoutInput = {
  plan: "professional" as const,
  customerEmail: "owner@example.se",
  companyId: "company-1",
  successUrl: "https://www.revalta.se/dashboard/billing?checkout=success&plan=professional",
  cancelUrl: "https://www.revalta.se/dashboard/billing?checkout=cancelled",
};

async function loadStripe() {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_checkout");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_checkout");
  vi.stubEnv("STRIPE_PRICE_PROFESSIONAL", "price_professional");
  vi.resetModules();
  return import("./stripe");
}

function stripeSuccess() {
  return new Response(JSON.stringify({
    id: "cs_test_123",
    url: "https://checkout.stripe.com/c/pay/cs_test_123",
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Stripe checkout idempotency", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reuses a deterministic idempotency key for identical checkout parameters in the retry window", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_788_356_400_000);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(stripeSuccess())
      .mockResolvedValueOnce(stripeSuccess())
      .mockResolvedValueOnce(stripeSuccess());
    vi.stubGlobal("fetch", fetchMock);
    const { createCheckoutSession } = await loadStripe();

    await createCheckoutSession(checkoutInput);
    await createCheckoutSession(checkoutInput);
    await createCheckoutSession({ ...checkoutInput, customerEmail: "other@example.se" });

    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    const changedHeaders = fetchMock.mock.calls[2]?.[1]?.headers as Record<string, string>;

    expect(firstHeaders["Idempotency-Key"]).toMatch(/^revalta_checkout_[a-f0-9]{64}$/);
    expect(secondHeaders["Idempotency-Key"]).toBe(firstHeaders["Idempotency-Key"]);
    expect(changedHeaders["Idempotency-Key"]).not.toBe(firstHeaders["Idempotency-Key"]);
  });

  it("forwards an explicit retry key when a caller supplies one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(stripeSuccess());
    vi.stubGlobal("fetch", fetchMock);
    const { createCheckoutSession } = await loadStripe();

    await createCheckoutSession({ ...checkoutInput, idempotencyKey: "checkout-attempt-123" });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("checkout-attempt-123");
  });

  it("rejects an oversized explicit idempotency key before calling Stripe", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { createCheckoutSession } = await loadStripe();

    await expect(createCheckoutSession({
      ...checkoutInput,
      idempotencyKey: "x".repeat(256),
    })).rejects.toThrow("idempotency key");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
