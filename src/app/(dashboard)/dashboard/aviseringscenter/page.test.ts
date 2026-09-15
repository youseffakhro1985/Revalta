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
