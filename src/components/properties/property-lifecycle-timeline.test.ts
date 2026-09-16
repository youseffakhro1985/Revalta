import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("property lifecycle timeline first HTML", () => {
  it("keeps the timeline filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./property-lifecycle-timeline.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="tidslinjefilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#tidslinjefilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain("if (loading) return <div className=\"h-72 animate-pulse rounded-2xl bg-sand-100\" />");
  });
});

describe("property lifecycle leftover events first HTML", () => {
  it("keeps leftover timeline events in the first HTML without stealing the filter", () => {
    const source = readFileSync(new URL("./property-lifecycle-timeline.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="tidslinjelista"');
    expect(source).toContain('window.location.hash !== "#tidslinjelista"');
    expect(source).toContain("Tidslinjen hämtas.");
    expect(source).toContain('id="tidslinjefilter"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
  });
});
