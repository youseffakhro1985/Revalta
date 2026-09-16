import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("lease inspection items save first HTML", () => {
  it("keeps save actions in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./lease-inspection-items-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-besiktning"');
    expect(source).toContain('id="besiktning-spara"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-besiktning"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("besiktning-spara")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading");
    expect(source).toContain("Spara besiktning");
    expect(source).toContain("Lägg till besiktningspunkt");
    expect(source).not.toContain('{loading ? <div className="h-48 animate-pulse rounded-xl bg-sand-100" />');
  });
});

describe("lease inspection leftover first HTML", () => {
  it("keeps leftover inspection items in the first HTML without stealing save", () => {
    const source = readFileSync(new URL("./lease-inspection-items-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="besiktningslista"');
    expect(source).toContain('window.location.hash !== "#besiktningslista"');
    expect(source).toContain("Besiktningspunkterna hämtas.");
    expect(source).toContain('id="spara-besiktning"');
    expect(source).toContain('id="besiktning-spara"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("saving || loading");
  });
});
