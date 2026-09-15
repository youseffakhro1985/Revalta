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
