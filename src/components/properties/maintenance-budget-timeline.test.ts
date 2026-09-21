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

describe("maintenance budget leftover yearly profile focus first HTML", () => {
  it("keeps leftover yearly investment profile in the first HTML and focuses reset after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./maintenance-budget-timeline.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="arsprofil"');
    expect(source).toContain('id="arsprofil-rensa"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#arsprofil"');
    expect(source).toContain("Laddar årsvis investeringsprofil för aktiv planversion.");
    expect(source).toContain('id="budgetfilter"');
    expect(source).toContain('id="budget-kategori"');
    expect(source).toContain('document.getElementById("budget-kategori")?.focus()');
    expect(source).toContain('document.getElementById("arsprofil-rensa")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).not.toContain('id="arsprofil-rensa" autoFocus');
    expect(sticky).toContain("${current}#spara-fastighet");
    expect(sticky).toContain("Spara fastighet");
    expect(sticky).not.toContain("#arsprofil");
    expect(sticky).not.toContain("#arsprofil-rensa");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/fastigheter/fastighet-1", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
