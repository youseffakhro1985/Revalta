import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("resident notices and documents SSR", () => {
  it("renders avier from the server without a client-only page shell", () => {
    const page = readFileSync(new URL("../../app/(dashboard)/dashboard/boendeportal/avier/page.tsx", import.meta.url), "utf8");
    expect(page).toContain("loadResidentPortalNotices");
    expect(page).toContain("ResidentNotices");
    expect(page).not.toContain("\"use client\"");
  });

  it("renders documents from the server and keeps download as a real link with a native GET filter", () => {
    const page = readFileSync(new URL("../../app/(dashboard)/dashboard/boendeportal/dokument/page.tsx", import.meta.url), "utf8");
    const documents = readFileSync(new URL("./resident-documents.tsx", import.meta.url), "utf8");

    expect(page).toContain("loadResidentPortalDocuments");
    expect(page).toContain("ResidentDocuments");
    expect(page).not.toContain("\"use client\"");
    expect(documents).toContain('method="get"');
    expect(documents).toContain('action="/dashboard/boendeportal/dokument"');
    expect(documents).toContain('name="leaseId"');
    expect(documents).toContain('name="q"');
    expect(documents).toContain("/api/resident-portal/documents/");
    expect(documents).toContain("<a href={downloadUrl}");
    expect(documents).toContain('id="boende-dokument"');
    expect(documents).toContain('id="boende-dokument-avtal"');
    expect(documents).toContain("autoFocus");
    expect(documents).toContain("scroll-mt-36");
    expect(documents).toContain("scrollIntoView");
    expect(documents).toContain('document.getElementById("boende-dokument-avtal")?.focus()');
    expect(documents).toContain("disabled={loading}");
  });

  it("does not add a boendeportal page sticky", () => {
    const sticky = readFileSync(new URL("./dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    expect(sticky).not.toContain("#boende-dokument");
    expect(sticky).not.toContain("#boende-dokument-avtal");
  });
});

describe("resident document leftover search first HTML", () => {
  it("keeps the leftover search in the first HTML and focuses it after load without a second autoFocus", () => {
    const documents = readFileSync(new URL("./resident-documents.tsx", import.meta.url), "utf8");
    expect(documents).toContain('id="boende-dokumentfilter"');
    expect(documents).toContain('id="boende-dokumentsok"');
    expect(documents).toContain("scroll-mt-36");
    expect(documents).toContain('window.location.hash !== "#boende-dokumentfilter"');
    expect(documents).toContain("scrollIntoView");
    expect(documents).toContain('document.getElementById("boende-dokumentsok")?.focus()');
    expect(documents).toContain("disabled={loading}");
    expect(documents).toContain('id="boende-dokument"');
    expect(documents).toContain('id="boende-dokument-avtal"');
    expect(documents).toContain('document.getElementById("boende-dokument-avtal")?.focus()');
    expect((documents.match(/autoFocus/g) || []).length).toBe(1);
    expect(documents).toContain("h-24 animate-pulse");
  });

  it("does not add a boendeportal page sticky for leftover search", () => {
    const sticky = readFileSync(new URL("./dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    expect(sticky).not.toContain("#boende-dokumentfilter");
    expect(sticky).not.toContain("#boende-dokumentsok");
    expect(sticky).not.toContain("#boende-dokument");
    expect(sticky).not.toContain("#boende-dokument-avtal");
  });
});
