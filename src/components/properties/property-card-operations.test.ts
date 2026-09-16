import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("property card operations first HTML", () => {
  it("keeps the operations search in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./property-card-operations.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="driftfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#driftfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain("if (loading) return <div className=\"space-y-4\"><div className=\"h-28 animate-pulse rounded-2xl bg-sand-100\"/><div className=\"grid gap-4 lg:grid-cols-3\">{[1,2,3].map(item=><div key={item} className=\"h-64 animate-pulse rounded-2xl bg-sand-100\"/>)}</div></div>");
  });
});

describe("property card leftover first HTML", () => {
  it("keeps leftover operations copy in the first HTML without stealing the filter", () => {
    const source = readFileSync(new URL("./property-card-operations.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="driftlista"');
    expect(source).toContain('window.location.hash !== "#driftlista"');
    expect(source).toContain("Driftkortet hämtas.");
    expect(source).toContain('id="driftfilter"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
  });
});
