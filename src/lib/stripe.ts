import { createHmac, timingSafeEqual } from "crypto";

const stripeApi = "https://api.stripe.com/v1";

export const stripePriceEnv: Record<string, string | undefined> = {
  start: process.env.STRIPE_PRICE_START,
  professional: process.env.STRIPE_PRICE_PROFESSIONAL,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

export function isStripeReady(plan?: string) {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      (!plan || stripePriceEnv[plan])
  );
}

async function stripePost(path: string, params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const response = await fetch(`${stripeApi}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof data.error?.message === "string" ? data.error.message : "Stripe-anrop misslyckades");
  }

  return data;
}

export async function createCheckoutSession(input: {
  plan: string;
  customerEmail: string;
  companyId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const price = stripePriceEnv[input.plan];
  if (!price) throw new Error("Stripe price saknas för vald plan");

  return stripePost("/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    customer_email: input.customerEmail,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "metadata[companyId]": input.companyId,
    "metadata[plan]": input.plan,
    "subscription_data[metadata][companyId]": input.companyId,
    "subscription_data[metadata][plan]": input.plan,
  });
}

export async function createCustomerPortalSession(input: {
  customerId: string;
  returnUrl: string;
}) {
  return stripePost("/billing_portal/sessions", {
    customer: input.customerId,
    return_url: input.returnUrl,
  });
}

export function verifyStripeSignature(payload: string, signatureHeader: string | null) {
  if (!process.env.STRIPE_WEBHOOK_SECRET || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}
