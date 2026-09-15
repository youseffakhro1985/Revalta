import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("accept-invite form", () => {
  it("submits named token, name and password fields from the form DOM", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("new FormData(event.currentTarget)");
    expect(source).toContain('name="token"');
    expect(source).toContain('name="name"');
    expect(source).toContain('name="password"');
    expect(source).toContain('id="accept-invite-form"');
    expect(source).toContain('method="post"');
    expect(source).toContain('action="/api/team/invites/accept"');
    expect(source).toContain("data-ready");
    expect(source).toContain('defaultValue=""');
    expect(source).not.toContain("value={password}");
    expect(source).toContain('get("reason")');
    expect(source).toContain("AuthShell");
    expect(source).not.toContain("disabled={!hydrated");
  });
});
