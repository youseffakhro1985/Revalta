import { describe, expect, it } from "vitest";
import { BILLING_PLAN_KEYS, BILLING_PLANS, isBillingPlanKey } from "@/lib/billing-plans";

describe("billing plan contract", () => {
  it("keeps the persisted legacy ids stable", () => {
    expect(BILLING_PLAN_KEYS).toEqual(["start", "professional", "enterprise"]);
  });

  it("keeps commercial labels and limits tied to one source of truth", () => {
    expect(BILLING_PLANS).toEqual({
      start: { label: "Start", price: 495, propertyLimit: 10, teamLimit: 3 },
      professional: { label: "Standard", price: 995, propertyLimit: 75, teamLimit: 15 },
      enterprise: { label: "Professional", price: 1995, propertyLimit: 999, teamLimit: 100 },
    });
  });

  it.each(["start", "professional", "enterprise"])("accepts known plan %s", (plan) => {
    expect(isBillingPlanKey(plan)).toBe(true);
  });

  it.each(["", "standard", "toString", "constructor", "__proto__", null, undefined, {}])(
    "rejects unknown or prototype-backed plan %s",
    (plan) => {
      expect(isBillingPlanKey(plan)).toBe(false);
    },
  );
});
