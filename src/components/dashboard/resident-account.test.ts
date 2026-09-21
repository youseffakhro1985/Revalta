import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("resident account native profile and password", () => {
  it("hydrates the account from the session and posts profile and password as native forms", () => {
    const page = readFileSync(new URL("../../app/(dashboard)/dashboard/boendeportal/konto/page.tsx", import.meta.url), "utf8");
    const account = readFileSync(new URL("./resident-account.tsx", import.meta.url), "utf8");

    expect(page).toContain("getCurrentUser");
    expect(page).toContain("ResidentAccount");
    expect(page).not.toContain("\"use client\"");
    expect(account).toContain('action="/api/settings/profile"');
    expect(account).toContain('action="/api/settings/password"');
    expect(account).toContain('method="post"');
    expect(account).toContain('name="name"');
    expect(account).toContain('name="currentPassword"');
    expect(account).toContain('name="newPassword"');
    expect(account).toContain('name="confirmPassword"');
    expect(account).toContain("event.preventDefault()");
    expect(account).toContain('id="resident-name"');
    expect(account).toContain("autoFocus");
    expect(account).toContain("scroll-mt-36");
    expect(account).toContain("scrollIntoView");
    expect(account).toContain('document.getElementById("resident-name")?.focus()');
    expect(account).toContain("disabled={savingProfile}");
  });

  it("does not add a boendeportal page sticky", () => {
    const sticky = readFileSync(new URL("./dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(sticky).not.toContain("/dashboard/boendeportal/konto");
    expect(sticky).not.toContain("#resident-name");
    expect(sticky).not.toContain("Boendeportal");
  });
});

describe("resident account leftover password first HTML", () => {
  it("keeps the leftover password form in the first HTML and focuses it after load without a second autoFocus", () => {
    const account = readFileSync(new URL("./resident-account.tsx", import.meta.url), "utf8");
    expect(account).toContain('id="resident-losenord"');
    expect(account).toContain('id="resident-current-password"');
    expect(account).toContain("scroll-mt-36");
    expect(account).toContain('window.location.hash !== "#resident-losenord"');
    expect(account).toContain("scrollIntoView");
    expect(account).toContain('document.getElementById("resident-current-password")?.focus()');
    expect(account).toContain("disabled={savingPassword}");
    expect(account).toContain('id="resident-name"');
    expect(account).toContain('document.getElementById("resident-name")?.focus()');
    expect((account.match(/autoFocus/g) || []).length).toBe(1);
  });

  it("does not add a boendeportal page sticky for leftover password", () => {
    const sticky = readFileSync(new URL("./dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    expect(sticky).not.toContain("#resident-losenord");
    expect(sticky).not.toContain("#resident-current-password");
    expect(sticky).not.toContain("#resident-name");
  });
});
