import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("register form", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./register-form.tsx", import.meta.url), "utf8");

  it("renders native-post errors from the server search params", () => {
    expect(page).not.toContain("\"use client\"");
    expect(page).toContain("searchParams");
    expect(page).toContain("await searchParams");
    expect(page).toContain("params.reason");
    expect(page).not.toContain("useSearchParams");
    expect(page).not.toContain("Suspense");
  });

  it("submits named fields from the form DOM", () => {
    expect(form).toContain("new FormData(e.currentTarget)");
    expect(form).toContain('name="name"');
    expect(form).toContain('name="companyName"');
    expect(form).toContain('name="email"');
    expect(form).toContain('name="password"');
    expect(form).toContain('id="register-form"');
    expect(form).toContain('method="post"');
    expect(form).toContain('action="/api/auth/register"');
    expect(form).toContain("data-ready");
    expect(form).toContain("E-postadressen används redan");
    expect(form).toContain("För många registreringar. Vänta en stund och prova igen.");
    expect(form).not.toContain("value={email}");
    expect(form).not.toContain("disabled={controlsDisabled}");
    expect(form).toContain("Fyll i namn, organisation, e-post och lösenord.");
    expect(form).toContain("Ange en giltig e-postadress.");
    expect(form).toContain("isValidEmail");
    expect(form).toContain("isStrongPassword");
    expect(form).not.toContain("disabled={!hydrated || loading}");
    expect(form).not.toContain("••••");
    expect(form).not.toContain("useSearchParams");
  });
});
