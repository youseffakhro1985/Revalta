import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("nycklar create hash", () => {
  it("keeps the register form hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="ny-nyckel"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#ny-nyckel"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).not.toContain('<form id="ny-nyckel"');
  });
});

describe("nycklar leftover register first HTML", () => {
  it("keeps leftover register in the first HTML without stealing Ny nyckel", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="nyckelfilter"');
    expect(source).toContain('id="nyckellista"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#nyckelfilter"');
    expect(source).toContain('window.location.hash !== "#nyckellista"');
    expect(source).toContain('id="ny-nyckel"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Nycklarna hämtas.");
    expect(source).not.toContain("LoadingState");
    expect(source).not.toContain("Hämtar nyckelregister…");
  });
});
