import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("accept-invite form", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./accept-invite-form.tsx", import.meta.url), "utf8");

  it("renders the token and reason from the server search params", () => {
    expect(page).not.toContain("\"use client\"");
    expect(page).toContain("searchParams");
    expect(page).toContain("await searchParams");
    expect(page).toContain("params.token");
    expect(page).toContain("params.reason");
    expect(page).not.toContain("useSearchParams");
    expect(page).not.toContain("Suspense");
  });

  it("submits named token, name and password fields from the form DOM", () => {
    expect(form).toContain("new FormData(event.currentTarget)");
    expect(form).toContain('name="token"');
    expect(form).toContain("value={token}");
    expect(form).toContain('name="name"');
    expect(form).toContain('name="password"');
    expect(form).toContain('id="accept-invite-form"');
    expect(form).toContain('method="post"');
    expect(form).toContain('action="/api/team/invites/accept"');
    expect(form).toContain("data-ready");
    expect(form).toContain('defaultValue=""');
    expect(form).not.toContain("value={password}");
    expect(form).toContain("Inbjudan är ogiltig eller har gått ut");
    expect(form).toContain("AuthShell");
    expect(form).not.toContain("disabled={!hydrated");
    expect(form).not.toContain("useSearchParams");
    expect(form).not.toContain("Suspense");
  });
});
