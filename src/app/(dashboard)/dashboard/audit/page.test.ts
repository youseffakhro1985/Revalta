import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("audit filter hash", () => {
  it("keeps the filter hash target in the first HTML", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(page).toContain('href="#auditfilter"');
    expect(page).toContain("Filtrera logg");
  });

  it("scrolls to the system log filters after load", () => {
    const center = readFileSync(new URL("../../../../components/settings/audit-log-center.tsx", import.meta.url), "utf8");
    expect(center).toContain('id="auditfilter"');
    expect(center).toContain('id="audit-handelse"');
    expect(center).toContain("scroll-mt-36");
    expect(center).toContain('window.location.hash !== "#auditfilter"');
    expect(center).toContain("scrollIntoView");
    expect(center).toContain('document.getElementById("audit-handelse")?.focus()');
    expect(center).toContain("autoFocus");
  });
});

describe("audit leftover events first HTML", () => {
  it("keeps leftover events in the first HTML without stealing Filtrera logg", () => {
    const center = readFileSync(new URL("../../../../components/settings/audit-log-center.tsx", import.meta.url), "utf8");
    expect(center).toContain('id="auditlista"');
    expect(center).toContain('window.location.hash !== "#auditlista"');
    expect(center).toContain("Händelserna hämtas.");
    expect(center).toContain('id="auditfilter"');
    expect(center).toContain('id="audit-handelse"');
    expect(center).toContain("autoFocus");
    expect(center).toContain("scrollIntoView");
    expect(center).toContain("disabled={loading}");
  });
});

describe("audit leftover events focus first HTML", () => {
  it("keeps leftover events in the first HTML and focuses export after load without a second autoFocus", () => {
    const center = readFileSync(new URL("../../../../components/settings/audit-log-center.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(center).toContain('id="auditlista"');
    expect(center).toContain('id="auditlista-csv"');
    expect(center).toContain("scroll-mt-36");
    expect(center).toContain('window.location.hash !== "#auditlista"');
    expect(center).toContain('id="auditfilter"');
    expect(center).toContain('id="audit-handelse"');
    expect(center).toContain('document.getElementById("audit-handelse")?.focus()');
    expect(center).toContain('document.getElementById("auditlista-csv")?.focus()');
    expect(center).toContain("scrollIntoView");
    expect(center).toContain("Händelserna hämtas.");
    expect((center.match(/autoFocus/g) || []).length).toBe(1);
    expect(center).not.toContain('id="auditlista-csv" autoFocus');
    expect(sticky).toContain('href: "/dashboard/audit#auditfilter"');
    expect(sticky).toContain("Filtrera logg");
    expect(sticky).not.toContain("#auditlista");
    expect(sticky).not.toContain("#auditlista-csv");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/audit", "manager")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
