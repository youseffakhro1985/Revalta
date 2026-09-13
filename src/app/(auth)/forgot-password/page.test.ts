import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("forgot-password form", () => {
  it("submits the named email field from the form DOM", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("new FormData(event.currentTarget)");
    expect(source).toContain("submittedEmail");
    expect(source).toContain('name="email"');
    expect(source).toContain('id="forgot-password-form"');
    expect(source).toContain('method="post"');
    expect(source).toContain('action="/api/auth/password-reset/request"');
    expect(source).toContain("data-ready");
    expect(source).not.toContain("value={email}");
    expect(source).not.toContain("readOnly=");
  });
});
