import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("billing checkout return", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./billing-page.tsx", import.meta.url), "utf8");

  it("renders Stripe checkout status from the server search params", () => {
    expect(page).not.toContain("\"use client\"");
    expect(page).toContain("searchParams");
    expect(page).toContain("await searchParams");
    expect(page).toContain("params.checkout");
  });

  it("shows success and cancelled copy before billing data has loaded", () => {
    expect(form).toContain("Stripe Checkout är slutförd");
    expect(form).toContain("Stripe Checkout avbröts");
    expect(form).toContain("checkoutReturnMessage(checkout");
    expect(form).toContain("{(success || error) && (");
    expect(form).not.toContain("{(success || (billing && error)) && (");
  });
});
