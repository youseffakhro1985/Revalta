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
  });
});
