import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reset-password form", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./reset-password-form.tsx", import.meta.url), "utf8");

  it("renders the token and reason from the server search params", () => {
    expect(page).not.toContain("\"use client\"");
    expect(page).toContain("searchParams");
    expect(page).toContain("await searchParams");
    expect(page).toContain("params.token");
    expect(page).toContain("params.reason");
    expect(page).not.toContain("useSearchParams");
    expect(page).not.toContain("Suspense");
  });

  it("submits named token and password fields from the form DOM", () => {
    expect(form).toContain("new FormData(event.currentTarget)");
    expect(form).toContain('name="token"');
    expect(form).toContain("value={token}");
    expect(form).toContain('name="password"');
    expect(form).toContain('name="confirmPassword"');
    expect(form).toContain('id="reset-password-form"');
    expect(form).toContain('method="post"');
    expect(form).toContain('action="/api/auth/password-reset/confirm"');
    expect(form).toContain("data-ready");
    expect(form).toContain('defaultValue=""');
    expect(form).not.toContain("value={password}");
    expect(form).not.toContain("value={confirmPassword}");
    expect(form).toContain("Lösenorden matchar inte");
    expect(form).toContain("passwordPolicyMessage");
    expect(form).toContain("Länken är ogiltig eller har gått ut");
    expect(form).not.toContain("disabled={!hydrated");
    expect(form).not.toContain("useSearchParams");
  });
});

describe("reset-password form first HTML focus", () => {
  it("keeps the leftover form in the first HTML and focuses the new password after load", () => {
    const form = readFileSync(new URL("./reset-password-form.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="reset-password-form"');
    expect(form).toContain('id="reset-password"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#reset-password-form"');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain('document.getElementById("reset-password")?.focus()');
    expect(form).toContain("autoFocus");
    expect(form).toContain("disabled={loading || !token}");
    expect((form.match(/autoFocus/g) || []).length).toBe(1);
  });

  it("does not add a dashboard sticky for public password reset", () => {
    const sticky = readFileSync(new URL("../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(sticky).not.toContain("#reset-password-form");
    expect(sticky).not.toContain("#reset-password");
    expect(sticky).not.toContain("/dashboard/boendeportal");
  });
});
