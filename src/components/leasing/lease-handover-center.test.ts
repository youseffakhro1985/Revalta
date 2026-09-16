import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("lease handover save first HTML", () => {
  it("keeps save actions in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./lease-handover-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-overlamning"');
    expect(source).toContain('id="overlamning-avtal"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-overlamning"');
    expect(source).toContain('window.location.hash !== "#valj-avtal"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("overlamning-avtal")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading");
    expect(source).toContain("Spara utkast");
    expect(source).toContain("Slutför överlämning");
    expect(source).not.toContain('{loading ? <div className="h-52 animate-pulse rounded-2xl bg-sand-100" />');
  });
});

describe("lease handover leftover first HTML", () => {
  it("keeps leftover handover copy in the first HTML without stealing the lease picker", () => {
    const source = readFileSync(new URL("./lease-handover-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="overlamninglista"');
    expect(source).toContain('window.location.hash !== "#overlamninglista"');
    expect(source).toContain("Överlämningen hämtas.");
    expect(source).toContain('id="valj-avtal"');
    expect(source).toContain('id="overlamning-avtal"');
    expect(source).toContain('id="spara-overlamning"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("saving || loading");
  });
});
