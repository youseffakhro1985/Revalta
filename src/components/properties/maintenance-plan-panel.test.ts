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

describe("maintenance plan leftover action list focus first HTML", () => {
  it("keeps leftover actions in the first HTML and focuses plan mode after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./maintenance-plan-panel.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="atgardslista"');
    expect(source).toContain('id="atgardslista-plan"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#atgardslista"');
    expect(source).toContain("Laddar åtgärder");
    expect(source).toContain('id="spara-underhallsplan"');
    expect(source).toContain('id="atgard-titel"');
    expect(source).toContain('document.getElementById("atgard-titel")?.focus()');
    expect(source).toContain('document.getElementById("atgardslista-plan")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).not.toContain('id="atgardslista-plan" autoFocus');
    expect(sticky).toContain("${current}#spara-fastighet");
    expect(sticky).toContain("Spara fastighet");
    expect(sticky).not.toContain("#atgardslista");
    expect(sticky).not.toContain("#atgardslista-plan");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/fastigheter/fastighet-1", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
