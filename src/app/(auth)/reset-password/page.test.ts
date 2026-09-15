import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reset-password form", () => {
  it("submits named token and password fields from the form DOM", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("new FormData(event.currentTarget)");
    expect(source).toContain('name="token"');
    expect(source).toContain('name="password"');
    expect(source).toContain('name="confirmPassword"');
    expect(source).toContain('id="reset-password-form"');
    expect(source).toContain('method="post"');
    expect(source).toContain('action="/api/auth/password-reset/confirm"');
    expect(source).toContain("data-ready");
    expect(source).toContain('defaultValue=""');
    expect(source).not.toContain("value={password}");
    expect(source).not.toContain("value={confirmPassword}");
    expect(source).toContain("Lösenorden matchar inte");
    expect(source).toContain("passwordPolicyMessage");
    expect(source).toContain('get("reason")');
    expect(source).not.toContain("disabled={!hydrated");
  });
});
