import { createHmac } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyStripeSignature } from "@/lib/stripe";

function sign(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

describe("verifyStripeSignature", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a valid signature", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const payload = JSON.stringify({ id: "evt_1" });
    expect(verifyStripeSignature(payload, sign(payload, "whsec_test"))).toBe(true);
  });

  it("accepts one of multiple valid v1 signatures", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const payload = JSON.stringify({ id: "evt_1" });
    const timestamp = Math.floor(Date.now() / 1000);
    const valid = sign(payload, "whsec_test", timestamp).split("v1=")[1];
    expect(verifyStripeSignature(payload, `t=${timestamp},v1=bad,v1=${valid}`)).toBe(true);
  });

  it("rejects old timestamps", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const payload = JSON.stringify({ id: "evt_1" });
    const oldTimestamp = Math.floor(Date.now() / 1000) - 1000;
    expect(verifyStripeSignature(payload, sign(payload, "whsec_test", oldTimestamp))).toBe(false);
  });
});
