import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("technician planning hash", () => {
  it("keeps the workload hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="arbetsbelastning"');
    expect(source).toContain('id="fordela-arbete"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('href="#arbetsbelastning"');
    expect(source).toContain("Fördela arbete");
    expect(source).toContain("canAssign || loading");
    expect(source).toContain('window.location.hash !== "#arbetsbelastning"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("fordela-arbete")?.focus()');
  });
});

describe("planning leftover list first HTML", () => {
  it("keeps leftover workload in the first HTML without stealing distribute", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="belastningslista"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#belastningslista"');
    expect(source).toContain('id="arbetsbelastning"');
    expect(source).toContain('id="fordela-arbete"');
    expect(source).toContain("Fördela arbete");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Arbetsbelastningen hämtas.");
    expect(source).not.toContain("h-64 animate-pulse rounded-xl bg-sand-50");
  });
});
