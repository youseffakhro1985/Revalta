import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("besiktningar create hash", () => {
  it("keeps the hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="ny-kontroll"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#ny-kontroll"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("canManage || loading");
    expect(source).toContain('id="kontroll-titel"');
    expect(source).toContain('document.getElementById("kontroll-titel")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).not.toContain('<form id="ny-kontroll"');
  });
});

describe("besiktningar leftover plan first HTML", () => {
  it("keeps the create form and plan in the first HTML without stealing Ny kontroll", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="kontrollplan"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#kontrollplan"');
    expect(source).toContain('id="ny-kontroll"');
    expect(source).toContain('id="kontroll-titel"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("saving || loading || !canManage");
    expect(source).toContain("Besiktningarna hämtas.");
    expect(source).not.toContain("h-64 animate-pulse rounded-xl bg-sand-100");
    expect(source).not.toContain('{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-sand-100" />)}');
  });
});
