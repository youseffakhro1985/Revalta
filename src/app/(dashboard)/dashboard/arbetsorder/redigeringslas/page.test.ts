import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("redigeringslas filter hash", () => {
  it("keeps the search panel in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="lasfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#lasfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain('id="las-sok"');
    expect(source).toContain('document.getElementById("las-sok")?.focus()');
    expect(source).toContain('href="#lasfilter"');
    expect(source).not.toContain("if (loading) return <div className=\"h-96 animate-pulse");
  });
});
