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

  it("keeps the plan hash target in the first HTML and scrolls after load", () => {
    expect(form).toContain('id="planer"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#planer"');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain('href="#planer"');
    expect(form).toContain("Byt plan");
  });
});

describe("billing leftover plans first HTML", () => {
  it("keeps leftover plan cards in the first HTML without stealing Byt plan", () => {
    const form = readFileSync(new URL("./billing-page.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="planuppgifter"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#planuppgifter"');
    expect(form).toContain('id="planer"');
    expect(form).toContain("Byt plan");
    expect(form).toContain("scrollIntoView");
    expect(form).toContain("Planerna hämtas.");
    expect(form).not.toContain("h-64 animate-pulse rounded-2xl bg-sand-100");
  });
});
