import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fakturaexporter filter hash", () => {
  it("keeps the filter panel hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="exportfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#exportfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain('href="#exportfilter"');
    expect(source).toContain("Filtrera export");
  });
});

describe("fakturaexporter leftover jobs first HTML", () => {
  it("keeps export jobs in the first HTML and scrolls after load without stealing filter", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="exportjobb"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#exportjobb"');
    expect(source).toContain('id="exportfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Exportjobben hämtas.");
    expect(source).not.toContain("h-64 animate-pulse rounded-xl bg-sand-100");
  });
});
