import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("verify-email form", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./verify-email-form.tsx", import.meta.url), "utf8");

  it("renders the token and reason from the server search params", () => {
    expect(page).not.toContain("\"use client\"");
    expect(page).toContain("searchParams");
    expect(page).toContain("await searchParams");
    expect(page).toContain("params.token");
    expect(page).toContain("params.reason");
    expect(page).not.toContain("useSearchParams");
    expect(page).not.toContain("Suspense");
  });

  it("submits the named token field from the form DOM", () => {
    expect(form).toContain("new FormData(event.currentTarget)");
    expect(form).toContain('name="token"');
    expect(form).toContain("value={token}");
    expect(form).toContain('id="verify-email-form"');
    expect(form).toContain('method="post"');
    expect(form).toContain('action="/api/auth/email-verification/confirm"');
    expect(form).toContain("data-ready");
    expect(form).toContain("type=\"submit\"");
    expect(form).not.toContain('type="button"');
    expect(form).toContain("Verifieringslänken är ogiltig eller har gått ut");
    expect(form).not.toContain("disabled={!hydrated");
    expect(form).not.toContain("useSearchParams");
  });
});

describe("verify-email form first HTML focus", () => {
  it("keeps the leftover form in the first HTML and focuses the action after load", () => {
    const form = readFileSync(new URL("./verify-email-form.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="verify-email-form"');
    expect(form).toContain('id="verify-email"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#verify-email-form"');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain('document.getElementById("verify-email")?.focus()');
    expect(form).toContain("autoFocus");
    expect(form).toContain("disabled={loading || !token || Boolean(message)}");
    expect((form.match(/autoFocus/g) || []).length).toBe(1);
  });

  it("does not add a dashboard sticky for public email verification", () => {
    const sticky = readFileSync(new URL("../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(sticky).not.toContain("#verify-email-form");
    expect(sticky).not.toContain("#verify-email");
    expect(sticky).not.toContain("/dashboard/boendeportal");
  });
});
