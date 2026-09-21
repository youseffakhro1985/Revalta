import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("property card manager save hash", () => {
  it("keeps the pärm form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./property-card-manager.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-fastighetspärm"');
    expect(source).toContain('id="parm-namn"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-fastighetspärm"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("parm-namn")?.focus()');
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
    expect(source).toContain('id="parm-namn"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("saving || loading || !data");
  });
});

describe("property card leftover record list focus first HTML", () => {
  it("keeps leftover pärm records in the first HTML and focuses create after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./property-card-manager.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="parmlista"');
    expect(source).toContain('id="parmlista-ny"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#parmlista"');
    expect(source).toContain("Laddar poster");
    expect(source).toContain('id="spara-fastighetspärm"');
    expect(source).toContain('id="parm-namn"');
    expect(source).toContain('document.getElementById("parm-namn")?.focus()');
    expect(source).toContain('document.getElementById("parmlista-ny")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).not.toContain('id="parmlista-ny" autoFocus');
    expect(sticky).toContain("${current}#spara-fastighet");
    expect(sticky).toContain("Spara fastighet");
    expect(sticky).not.toContain("#parmlista");
    expect(sticky).not.toContain("#parmlista-ny");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/fastigheter/fastighet-1", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
