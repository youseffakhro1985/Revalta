import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("aviseringscenter filter hash", () => {
  it("keeps the filter chips hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="aviseringsfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#aviseringsfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain('id="avisering-alla"');
    expect(source).toContain('document.getElementById("avisering-alla")?.focus()');
    expect(source).toContain('href="#aviseringsfilter"');
  });
});

describe("aviseringscenter leftover list first HTML", () => {
  it("keeps leftover notifications in the first HTML and focuses refresh after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="aviseringslista"');
    expect(source).toContain('id="aviseringslista-uppdatera"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#aviseringslista"');
    expect(source).toContain('id="aviseringsfilter"');
    expect(source).toContain('id="avisering-alla"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Aviseringarna hämtas.");
    expect(source).toContain('document.getElementById("aviseringslista-uppdatera")?.focus()');
    expect(source).toContain('document.getElementById("avisering-alla")?.focus()');
    expect(source).toContain("disabled={loading}");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="aviseringslista-uppdatera" autoFocus');
    expect(source).not.toContain("h-64 animate-pulse bg-sand-50");
    expect(sticky).toContain('href: "/dashboard/aviseringscenter#aviseringsfilter"');
    expect(sticky).not.toContain("#aviseringslista");
    expect(sticky).not.toContain("#aviseringslista-uppdatera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/aviseringscenter", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
