import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("resident portal home native ticket create", () => {
  it("posts felanmälan as a native form and hydrates from the server-rendered workspace", () => {
    const page = readFileSync(new URL("../../app/(dashboard)/dashboard/boendeportal/page.tsx", import.meta.url), "utf8");
    const home = readFileSync(new URL("./resident-portal-home.tsx", import.meta.url), "utf8");

    expect(page).toContain("loadResidentPortalHome");
    expect(page).toContain("ResidentPortalHome");
    expect(page).not.toContain("\"use client\"");
    expect(home).toContain('action="/api/resident-portal"');
    expect(home).toContain('method="post"');
    expect(home).toContain('name="leaseId"');
    expect(home).toContain('name="subject"');
    expect(home).toContain('name="message"');
    expect(home).toContain("event.preventDefault()");
    expect(home).toContain('id="boende-editor"');
    expect(home).toContain('id="boende-avtal"');
    expect(home).toContain("autoFocus");
    expect(home).toContain("scroll-mt-36");
    expect(home).toContain("scrollIntoView");
    expect(home).toContain('document.getElementById("boende-avtal")?.focus()');
    expect(home).toContain("disabled={saving || loading}");
  });

  it("does not add a boendeportal page sticky", () => {
    const sticky = readFileSync(new URL("./dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    expect(sticky).not.toContain("#boende-editor");
    expect(sticky).not.toContain("#boende-avtal");
  });
});
