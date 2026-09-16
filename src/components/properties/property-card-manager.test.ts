import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("property card manager save hash", () => {
  it("keeps the pärm form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./property-card-manager.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-fastighetspärm"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-fastighetspärm"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading || !data");
    expect(source).not.toContain("if (loading) return <div className=\"h-72 animate-pulse rounded-2xl bg-sand-100\" />");
  });
});

describe("property card leftover records first HTML", () => {
  it("keeps leftover pärm records in the first HTML without stealing save", () => {
    const source = readFileSync(new URL("./property-card-manager.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="parmlista"');
    expect(source).toContain('window.location.hash !== "#parmlista"');
    expect(source).toContain("Laddar poster");
    expect(source).toContain('id="spara-fastighetspärm"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("saving || loading || !data");
  });
});
