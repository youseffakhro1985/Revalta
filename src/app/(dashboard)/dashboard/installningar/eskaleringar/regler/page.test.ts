import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("eskaleringsregler hash target", () => {
  it("keeps the rules form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="eskaleringsregler"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain("window.location.hash");
    expect(source).toContain('hash !== "#eskaleringsregler"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('href="#eskaleringsregler"');
    expect(source).toContain("disabled={locked}");
    expect(source).toContain("autoFocus");
    expect(source).not.toContain("Laddar eskaleringsregler");
    expect(source).not.toContain("if (loading || !rules)");
  });
});

describe("eskaleringsregler sticky mutate first HTML", () => {
  it("scrolls and focuses Spara regler after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="eskaleringsregler"');
    expect(source).toContain('id="eskalering-motor"');
    expect(source).toContain("autoFocus");
    expect(source).toContain('window.location.hash !== "#eskaleringsregler"');
    expect(source).toContain('document.getElementById("eskalering-motor")?.focus()');
    expect(source).toContain("if (loading) return");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Spara regler");
    expect(source).toContain("disabled={locked}");
  });
});
