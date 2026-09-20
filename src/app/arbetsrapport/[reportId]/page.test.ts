import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public arbetsrapport print first HTML", () => {
  it("keeps the print action in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="skriv-ut"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#skriv-ut"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("skriv-ut")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain("if (loading) return <div className=\"mx-auto mt-16 h-[760px] max-w-4xl animate-pulse rounded-3xl bg-sand-100\" />");
  });
});

describe("public arbetsrapport leftover body first HTML", () => {
  it("keeps leftover report body in the first HTML without stealing print", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="rapportinnehall"');
    expect(source).toContain('window.location.hash !== "#rapportinnehall"');
    expect(source).toContain("Rapporten hämtas.");
    expect(source).toContain('id="skriv-ut"');
    expect(source).toContain('document.getElementById("skriv-ut")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
  });
});
