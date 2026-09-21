import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("component audit report first HTML", () => {
  it("keeps export and refresh in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./component-audit-report.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="exportera-revision"');
    expect(source).toContain('id="revision-uppdatera"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#exportera-revision"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("revision-uppdatera")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Exportera CSV");
    expect(source).not.toContain('{loading && !data ? <div className="h-40 animate-pulse rounded-xl bg-sand-100" /> : null}');
  });
});

describe("component audit leftover first HTML", () => {
  it("keeps leftover revision history in the first HTML without stealing export", () => {
    const source = readFileSync(new URL("./component-audit-report.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="revisionslista"');
    expect(source).toContain('window.location.hash !== "#revisionslista"');
    expect(source).toContain("Historiken hämtas.");
    expect(source).toContain('id="exportera-revision"');
    expect(source).toContain('id="revision-uppdatera"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain('id="auditlista"');
  });
});

describe("component audit leftover list focus first HTML", () => {
  it("keeps leftover revision history in the first HTML and focuses export after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./component-audit-report.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="revisionslista"');
    expect(source).toContain('id="revisionslista-csv"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#revisionslista"');
    expect(source).toContain('id="exportera-revision"');
    expect(source).toContain('id="revision-uppdatera"');
    expect(source).toContain('document.getElementById("revision-uppdatera")?.focus()');
    expect(source).toContain('document.getElementById("revisionslista-csv")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Historiken hämtas.");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="revisionslista-csv" autoFocus');
    expect(source).not.toContain('id="auditlista"');
    expect(sticky).toContain("#spara-komponent");
    expect(sticky).toContain("Spara komponent");
    expect(sticky).not.toContain("#revisionslista");
    expect(sticky).not.toContain("#revisionslista-csv");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/fastigheter/fastighet-1/komponenter/comp-1", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
