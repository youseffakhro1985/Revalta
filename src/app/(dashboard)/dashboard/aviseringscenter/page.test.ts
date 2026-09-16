import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("aviseringscenter filter hash", () => {
  it("keeps the filter chips hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="aviseringsfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#aviseringsfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain('href="#aviseringsfilter"');
  });
});

describe("aviseringscenter leftover list first HTML", () => {
  it("keeps leftover notifications in the first HTML without stealing filter", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="aviseringslista"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#aviseringslista"');
    expect(source).toContain('id="aviseringsfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Aviseringarna hämtas.");
    expect(source).not.toContain("h-64 animate-pulse bg-sand-50");
  });
});
