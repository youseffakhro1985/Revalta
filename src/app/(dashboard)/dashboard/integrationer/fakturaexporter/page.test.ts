import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fakturaexporter filter hash", () => {
  it("keeps the filter panel hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="exportfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#exportfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain('id="export-sok"');
    expect(source).toContain('document.getElementById("export-sok")?.focus()');
    expect(source).toContain('href="#exportfilter"');
    expect(source).toContain("Filtrera export");
  });
});

describe("fakturaexporter leftover jobs first HTML", () => {
  it("keeps export jobs in the first HTML and scrolls after load without stealing filter", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="exportjobb"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#exportjobb"');
    expect(source).toContain('id="exportfilter"');
    expect(source).toContain('id="export-sok"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Exportjobben hämtas.");
    expect(source).not.toContain("h-64 animate-pulse rounded-xl bg-sand-100");
  });
});

describe("fakturaexporter leftover jobs focus first HTML", () => {
  it("keeps leftover export jobs in the first HTML and focuses refresh after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="exportjobb"');
    expect(source).toContain('id="exportjobb-uppdatera"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#exportjobb"');
    expect(source).toContain('id="exportfilter"');
    expect(source).toContain('id="export-sok"');
    expect(source).toContain('document.getElementById("export-sok")?.focus()');
    expect(source).toContain('document.getElementById("exportjobb-uppdatera")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Exportjobben hämtas.");
    expect(source).toContain("inte en inbyggd Fortnox- eller Visma-SDK");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="exportjobb-uppdatera" autoFocus');
    expect(source).not.toContain("h-64 animate-pulse rounded-xl bg-sand-100");
    expect(sticky).toContain('href: "/dashboard/integrationer/fakturaexporter#exportfilter"');
    expect(sticky).toContain("Filtrera export");
    expect(sticky).not.toContain("#exportjobb");
    expect(sticky).not.toContain("#exportjobb-uppdatera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/integrationer/fakturaexporter", "manager")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
