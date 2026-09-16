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

describe("dokument library filter first HTML", () => {
  it("keeps the filter in the first HTML and scrolls after load without stealing create", () => {
    const form = readFileSync(new URL("./dokument-page.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="dokumentfilter"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#dokumentfilter"');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain("Nytt dokument");
    expect(form).toContain("disabled={loading}");
    expect(form).toContain("Dokumenten hämtas.");
    expect(form).not.toContain('{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-sand-100" />)}');
  });
});
