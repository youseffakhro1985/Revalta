import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("maintenance plan panel create hash", () => {
  it("keeps the plan and action form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./maintenance-plan-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-underhallsplan"');
    expect(source).toContain('id="atgard-titel"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-underhallsplan"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("atgard-titel")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading || !data");
    expect(source).not.toContain("if(loading)return <div className=\"space-y-4\"><div className=\"h-28 animate-pulse rounded-2xl bg-sand-100\"/><div className=\"h-96 animate-pulse rounded-2xl bg-sand-100\"/></div>");
  });
});

describe("maintenance plan leftover actions first HTML", () => {
  it("keeps leftover actions in the first HTML without stealing save", () => {
    const source = readFileSync(new URL("./maintenance-plan-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="atgardslista"');
    expect(source).toContain('window.location.hash !== "#atgardslista"');
    expect(source).toContain("Laddar åtgärder");
    expect(source).toContain('id="spara-underhallsplan"');
    expect(source).toContain('id="atgard-titel"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("saving || loading || !data");
  });
});
