import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("forgot-password form", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./forgot-password-form.tsx", import.meta.url), "utf8");

  it("renders the sent confirmation from the server search params", () => {
    expect(page).not.toContain("\"use client\"");
    expect(page).toContain("searchParams");
    expect(page).toContain("await searchParams");
    expect(page).toContain("params.sent === \"1\"");
    expect(page).not.toContain("useSearchParams");
    expect(page).not.toContain("Suspense");
  });

  it("submits the named email field from the form DOM", () => {
    expect(form).toContain("new FormData(event.currentTarget)");
    expect(form).toContain("submittedEmail");
    expect(form).toContain('name="email"');
    expect(form).toContain('id="forgot-password-form"');
    expect(form).toContain('method="post"');
    expect(form).toContain('action="/api/auth/password-reset/request"');
    expect(form).toContain("data-ready");
    expect(form).not.toContain("value={email}");
    expect(form).not.toContain("readOnly=");
    expect(form).toContain("Ange e-postadressen till kontot.");
    expect(form).toContain("Ange en giltig e-postadress.");
    expect(form).toContain("isValidEmail");
    expect(form).toContain("setError");
    expect(form).toContain("Om kontot finns skickar vi en återställningslänk.");
    expect(form).not.toContain("disabled={!hydrated || loading}");
    expect(form).not.toContain("useSearchParams");
  });
});

describe("forgot-password form first HTML focus", () => {
  it("keeps the leftover form in the first HTML and focuses the email after load", () => {
    const form = readFileSync(new URL("./forgot-password-form.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="forgot-password-form"');
    expect(form).toContain('id="forgot-password-email"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#forgot-password-form"');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain('document.getElementById("forgot-password-email")?.focus()');
    expect(form).toContain("autoFocus");
    expect(form).toContain("disabled={loading}");
    expect((form.match(/autoFocus/g) || []).length).toBe(1);
  });

  it("does not add a dashboard sticky for public password reset request", () => {
    const sticky = readFileSync(new URL("../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(sticky).not.toContain("#forgot-password-form");
    expect(sticky).not.toContain("#forgot-password-email");
    expect(sticky).not.toContain("/dashboard/boendeportal");
  });
});
