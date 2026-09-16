import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("inspection work-order center first HTML", () => {
  it("keeps the create action in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./inspection-work-order-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="skapa-besiktningsorder"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#skapa-besiktningsorder"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={formLocked}");
    expect(source).toContain("Skapa arbetsorder");
    expect(source).not.toContain('{loading ? <div className="h-36 animate-pulse rounded-xl bg-sand-100" />');
  });
});

describe("inspection work-order leftover first HTML", () => {
  it("keeps leftover inspection points in the first HTML without stealing create", () => {
    const source = readFileSync(new URL("./inspection-work-order-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="punktlista"');
    expect(source).toContain('window.location.hash !== "#punktlista"');
    expect(source).toContain("Punkterna hämtas.");
    expect(source).toContain('id="skapa-besiktningsorder"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={formLocked}");
  });
});
