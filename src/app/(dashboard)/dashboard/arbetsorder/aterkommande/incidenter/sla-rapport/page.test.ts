import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("recurring incident SLA report export hash", () => {
  it("keeps the CSV export hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="exportera-csv"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#exportera-csv"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("format=csv");
  });
});

describe("recurring incident SLA leftover first HTML", () => {
  it("keeps leftover SLA rows in the first HTML without stealing Exportera CSV", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="sladetaljer"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#sladetaljer"');
    expect(source).toContain('id="exportera-csv"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("SLA-raderna hämtas.");
    expect(source).not.toContain("Hämtar rapportdata…");
  });
});
