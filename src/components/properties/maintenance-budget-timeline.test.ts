import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("maintenance budget timeline filter hash", () => {
  it("keeps the budget filters in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./maintenance-budget-timeline.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="budgetfilter"');
    expect(source).toContain('id="budget-kategori"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#budgetfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("budget-kategori")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("loading || !data?.activePlan");
    expect(source).not.toContain("if (loading) return <div className=\"h-96 animate-pulse rounded-2xl bg-sand-100\" />");
  });
});

describe("maintenance budget leftover yearly profile first HTML", () => {
  it("keeps leftover yearly investment profile in the first HTML without stealing filter", () => {
    const source = readFileSync(new URL("./maintenance-budget-timeline.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="arsprofil"');
    expect(source).toContain('window.location.hash !== "#arsprofil"');
    expect(source).toContain("Laddar årsvis investeringsprofil för aktiv planversion.");
    expect(source).toContain('id="budgetfilter"');
    expect(source).toContain('id="budget-kategori"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("loading || !data?.activePlan");
  });
});
