import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mina aviseringar hash target", () => {
  it("keeps mina-val in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="mina-val"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash');
    expect(source).toContain('hash !== "#mina-val"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('href="#mina-val"');
    expect(source).toContain("disabled={loading || saving}");
    expect(source).not.toContain("h-52 animate-pulse");
  });
});

describe("mina aviseringar leftover status first HTML", () => {
  it("keeps leftover status in the first HTML without stealing Mina val", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="minastatus"');
    expect(source).toContain('window.location.hash !== "#minastatus"');
    expect(source).toContain("Valen hämtas.");
    expect(source).toContain('id="mina-val"');
    expect(source).toContain("Spara mina val");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading || saving}");
  });
});
