export const BILLING_PLANS = {
  start: {
    label: "Start",
    price: 495,
    propertyLimit: 10,
    teamLimit: 3,
  },
  // Legacy storage id: existing Company.plan values and Stripe metadata use
  // "professional" for the commercially named Standard tier.
  professional: {
    label: "Standard",
    price: 995,
    propertyLimit: 75,
    teamLimit: 15,
  },
  // Legacy storage id: existing Stripe metadata uses "enterprise" for the
  // commercially named Professional tier. Do not rename without a data and
  // Stripe metadata migration.
  enterprise: {
    label: "Professional",
    price: 1995,
    propertyLimit: 999,
    teamLimit: 100,
  },
} as const;

export type BillingPlanKey = keyof typeof BILLING_PLANS;

export const BILLING_PLAN_KEYS = Object.freeze(
  Object.keys(BILLING_PLANS) as BillingPlanKey[],
);

export function isBillingPlanKey(value: unknown): value is BillingPlanKey {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(BILLING_PLANS, value)
  );
}
