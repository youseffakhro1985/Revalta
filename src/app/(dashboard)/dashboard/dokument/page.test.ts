import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dokument create query", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./dokument-page.tsx", import.meta.url), "utf8");

  it("opens the upload form from the server search params", () => {
    expect(page).not.toContain("\"use client\"");
    expect(page).toContain("searchParams");
    expect(page).toContain("await searchParams");
    expect(page).toContain('params.create === "1"');
    expect(page).toContain("initialCreate");
  });

  it("keeps the sticky-header create contract and native close", () => {
    expect(form).toContain("useState(initialCreate)");
    expect(form).toContain('get("create") === "1"');
    expect(form).toContain("closeCreate");
    expect(form).toContain("router.replace");
    expect(form).toContain("Nytt dokument");
    expect(form).toContain("autoFocus");
    expect(form).toContain("<Plus");
    expect(form).not.toContain("＋");
  });
});
