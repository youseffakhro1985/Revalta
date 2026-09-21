import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("energi create hash", () => {
  it("keeps the hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="ny-avlasning"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#ny-avlasning"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("canManage || loading");
    expect(source).toContain('id="energi-fastighet"');
    expect(source).toContain('document.getElementById("energi-fastighet")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).not.toContain('<form id="ny-avlasning"');
  });
});

describe("energi leftover filter first HTML", () => {
  it("keeps the filter in the first HTML and scrolls after load without stealing create", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="energifilter"');
    expect(source).toContain('id="energi-sok"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#energifilter"');
    expect(source).toContain('id="ny-avlasning"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("energi-sok")?.focus()');
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Avläsningarna hämtas.");
    expect(source).not.toContain('{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}');
  });
});

describe("energi leftover readings first HTML", () => {
  it("keeps leftover energy readings in the first HTML without stealing create or filter", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="energilista"');
    expect(source).toContain('window.location.hash !== "#energilista"');
    expect(source).toContain("Avläsningarna hämtas.");
    expect(source).toContain('id="ny-avlasning"');
    expect(source).toContain('id="energi-fastighet"');
    expect(source).toContain('id="energifilter"');
    expect(source).toContain('id="energi-sok"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("canManage || loading");
  });
});
