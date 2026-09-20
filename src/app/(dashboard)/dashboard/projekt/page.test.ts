import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("projekt create query", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("./projekt-page.tsx", import.meta.url), "utf8");

  it("opens the create form from the server search params", () => {
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
    expect(form).toContain("Nytt projekt");
    expect(form).toContain("autoFocus");
    expect(form).toContain("<Plus");
    expect(form).not.toContain("＋");
  });
});

describe("projekt portfolio filter first HTML", () => {
  it("keeps the filter in the first HTML and scrolls after load without stealing create", () => {
    const form = readFileSync(new URL("./projekt-page.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="projektfilter"');
    expect(form).toContain('id="projekt-sok"');
    expect(form).toContain("scroll-mt-36");
    expect(form).toContain('window.location.hash !== "#projektfilter"');
    expect(form).toContain("scrollIntoView");
    expect(form).toContain('document.getElementById("projekt-sok")?.focus()');
    expect(form).toContain("Nytt projekt");
    expect(form).toContain("disabled={loading}");
    expect(form).toContain("Projekten hämtas.");
    expect(form).not.toContain('{[1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-sand-100" />)}');
  });
});

describe("projekt leftover portfolio first HTML", () => {
  it("keeps leftover projects in the first HTML without stealing create or filter", () => {
    const form = readFileSync(new URL("./projekt-page.tsx", import.meta.url), "utf8");
    expect(form).toContain('id="projektlista"');
    expect(form).toContain('window.location.hash !== "#projektlista"');
    expect(form).toContain("Projekten hämtas.");
    expect(form).toContain('id="projektfilter"');
    expect(form).toContain('id="projekt-sok"');
    expect(form).toContain("Nytt projekt");
    expect(form).toContain("autoFocus");
    expect(form).toContain("scrollIntoView");
    expect(form).toContain("disabled={loading}");
  });
});
