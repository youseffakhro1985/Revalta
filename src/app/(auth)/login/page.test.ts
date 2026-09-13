import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("login form", () => {
  it("submits named email and password fields from the form DOM", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("new FormData(e.currentTarget)");
    expect(source).toContain('name="email"');
    expect(source).toContain('name="password"');
    expect(source).toContain("submittedEmail");
    expect(source).toContain("submittedPassword");
    expect(source).toContain('id="login-form"');
    expect(source).toContain('method="post"');
    expect(source).toContain('action="/api/auth/login"');
    expect(source).toContain("data-ready");
  });
});
