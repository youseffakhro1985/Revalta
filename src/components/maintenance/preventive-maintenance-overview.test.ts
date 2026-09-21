import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("preventive maintenance run hash", () => {
  it("keeps the run-engine action in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./preventive-maintenance-overview.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="kor-motor"');
    expect(source).toContain('id="kor-motor-knapp"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#kor-motor"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("kor-motor-knapp")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("data?.canRun || loading");
    expect(source).not.toContain("if (loading) return <div className=\"h-96 animate-pulse");
    expect(source).not.toContain("if (!data) return null");
  });
});

describe("preventive maintenance service filter first HTML", () => {
  it("keeps the service filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./preventive-maintenance-overview.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="servicefilter"');
    expect(source).toContain('id="service-alla"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#servicefilter"');
    expect(source).toContain('window.location.hash !== "#kor-motor"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("service-alla")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Kör underhållsmotorn");
    expect(source).not.toContain('{loading && !data ? <div className="h-48 animate-pulse rounded-xl bg-sand-100" aria-hidden="true" /> : null}');
  });
});

describe("preventive maintenance leftover overview first HTML", () => {
  it("keeps leftover service rows in the first HTML without stealing run or filter", () => {
    const source = readFileSync(new URL("./preventive-maintenance-overview.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="serviceoversikt"');
    expect(source).toContain('window.location.hash !== "#serviceoversikt"');
    expect(source).toContain("Serviceöversikten hämtas.");
    expect(source).toContain('id="kor-motor"');
    expect(source).toContain('id="kor-motor-knapp"');
    expect(source).toContain('id="servicefilter"');
    expect(source).toContain('id="service-alla"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("data?.canRun || loading");
  });
});

describe("preventive maintenance leftover overview focus first HTML", () => {
  it("keeps leftover service rows in the first HTML and focuses refresh after load without a third autoFocus", () => {
    const source = readFileSync(new URL("./preventive-maintenance-overview.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="serviceoversikt"');
    expect(source).toContain('id="serviceoversikt-uppdatera"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#serviceoversikt"');
    expect(source).toContain('id="kor-motor"');
    expect(source).toContain('id="kor-motor-knapp"');
    expect(source).toContain('document.getElementById("kor-motor-knapp")?.focus()');
    expect(source).toContain('document.getElementById("serviceoversikt-uppdatera")?.focus()');
    expect(source).toContain('id="servicefilter"');
    expect(source).toContain('id="service-alla"');
    expect(source).toContain('document.getElementById("service-alla")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Serviceöversikten hämtas.");
    expect((source.match(/autoFocus/g) || []).length).toBe(2);
    expect(source).not.toContain('id="serviceoversikt-uppdatera" autoFocus');
    expect(sticky).toContain("/dashboard/underhall/service#kor-motor");
    expect(sticky).toContain("Kör underhåll");
    expect(sticky).not.toContain("#serviceoversikt");
    expect(sticky).not.toContain("#serviceoversikt-uppdatera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/underhall/service", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
