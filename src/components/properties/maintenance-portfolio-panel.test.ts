import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("maintenance portfolio filter hash", () => {
  it("keeps the filter hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./maintenance-portfolio-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="portfoljfilter"');
    expect(source).toContain('id="portfolj-fastighet"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#portfoljfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("portfolj-fastighet")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).not.toContain("if (loading) return <section className=\"space-y-6\" aria-labelledby=\"portfolio-maintenance-heading\">");
    expect(source).not.toContain("if (rows.length === 0) return <section");
  });
});

describe("maintenance portfolio charts first HTML", () => {
  it("keeps the chart target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./maintenance-portfolio-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="portfoljbehov"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#portfoljbehov"');
    expect(source).toContain('window.location.hash !== "#portfoljfilter"');
    expect(source).toContain("Portföljen hämtas.");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).not.toContain('{loading && rows.length === 0 ? <div className="h-96 animate-pulse rounded-2xl bg-sand-100" aria-hidden="true" /> : null}');
  });
});

describe("maintenance portfolio leftover list focus first HTML", () => {
  it("keeps leftover portfolio charts in the first HTML and focuses reset after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./maintenance-portfolio-panel.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="portfoljbehov"');
    expect(source).toContain('id="portfoljbehov-rensa"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#portfoljbehov"');
    expect(source).toContain("Portföljen hämtas.");
    expect(source).toContain('id="portfoljfilter"');
    expect(source).toContain('id="portfolj-fastighet"');
    expect(source).toContain('document.getElementById("portfolj-fastighet")?.focus()');
    expect(source).toContain('document.getElementById("portfoljbehov-rensa")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).not.toContain('id="portfoljbehov-rensa" autoFocus');
    expect(sticky).toContain('href: "/dashboard/underhall/portfolio#portfoljfilter"');
    expect(sticky).toContain("Filtrera portfölj");
    expect(sticky).not.toContain("#portfoljbehov");
    expect(sticky).not.toContain("#portfoljbehov-rensa");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/underhall/portfolio", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
