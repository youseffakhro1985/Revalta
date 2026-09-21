import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("service notification alert center first HTML", () => {
  it("keeps the alert filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./service-notification-alert-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="driftlarm"');
    expect(source).toContain('id="driftlarm-status"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#driftlarm"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("driftlarm-status")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Kvittera larm");
    expect(source).not.toContain("if (loading && !data) {");
    expect(source).not.toContain('return <div className="h-36 animate-pulse rounded-2xl border border-sand-200 bg-sand-50" aria-label="Laddar driftlarm" />');
  });
});

describe("service notification leftover first HTML", () => {
  it("keeps leftover alerts in the first HTML without stealing the filter", () => {
    const source = readFileSync(new URL("./service-notification-alert-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="larmlista"');
    expect(source).toContain('window.location.hash !== "#larmlista"');
    expect(source).toContain("Larmen hämtas.");
    expect(source).toContain('id="driftlarm"');
    expect(source).toContain('id="driftlarm-form"');
    expect(source).toContain('id="driftlarm-status"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
  });
});

describe("service notification leftover list focus first HTML", () => {
  it("keeps leftover alerts in the first HTML and focuses refresh after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./service-notification-alert-center.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("./dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="larmlista"');
    expect(source).toContain('id="larmlista-uppdatera"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#larmlista"');
    expect(source).toContain('id="driftlarm"');
    expect(source).toContain('id="driftlarm-status"');
    expect(source).toContain('document.getElementById("driftlarm-status")?.focus()');
    expect(source).toContain('document.getElementById("larmlista-uppdatera")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Larmen hämtas.");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="larmlista-uppdatera" autoFocus');
    expect(sticky).toContain('href: "/dashboard/installningar/aviseringar#aviseringsinstallningar"');
    expect(sticky).toContain("Aviseringsval");
    expect(sticky).not.toContain("#larmlista");
    expect(sticky).not.toContain("#larmlista-uppdatera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("./dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/installningar/aviseringar", "technician")?.label).toBe("Aviseringsval")');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
