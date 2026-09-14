import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("verify-email form", () => {
  it("submits the named token field from the form DOM", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("new FormData(event.currentTarget)");
    expect(source).toContain('name="token"');
    expect(source).toContain('id="verify-email-form"');
    expect(source).toContain('method="post"');
    expect(source).toContain('action="/api/auth/email-verification/confirm"');
    expect(source).toContain("data-ready");
    expect(source).toContain("type=\"submit\"");
    expect(source).not.toContain('type="button"');
    expect(source).toContain('get("reason")');
    expect(source).toContain("Verifieringslänken är ogiltig eller har gått ut");
  });
});
