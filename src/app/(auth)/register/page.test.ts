import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("register form", () => {
  it("submits named fields from the form DOM", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("new FormData(e.currentTarget)");
    expect(source).toContain('name="name"');
    expect(source).toContain('name="companyName"');
    expect(source).toContain('name="email"');
    expect(source).toContain('name="password"');
    expect(source).toContain('id="register-form"');
    expect(source).toContain('method="post"');
    expect(source).toContain('action="/api/auth/register"');
    expect(source).toContain("data-ready");
    expect(source).toContain('get("reason")');
    expect(source).toContain("E-postadressen används redan");
    expect(source).toContain("För många registreringar. Vänta en stund och prova igen.");
    expect(source).not.toContain("value={email}");
    expect(source).not.toContain("disabled={controlsDisabled}");
    expect(source).toContain("Fyll i namn, organisation, e-post och lösenord.");
    expect(source).toContain("Ange en giltig e-postadress.");
    expect(source).toContain("isValidEmail");
    expect(source).toContain("isStrongPassword");
    expect(source).not.toContain("••••");
  });
});
