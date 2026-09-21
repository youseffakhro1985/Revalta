import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("lease handover save first HTML", () => {
  it("keeps save actions in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./lease-handover-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-overlamning"');
    expect(source).toContain('id="overlamning-spara"');
    expect(source).toContain('id="overlamning-avtal"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-overlamning"');
    expect(source).toContain('window.location.hash !== "#valj-avtal"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("overlamning-spara")?.focus()');
    expect(source).toContain('document.getElementById("overlamning-avtal")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading");
    expect(source).toContain("Spara utkast");
    expect(source).toContain("Slutför överlämning");
    expect(source).not.toContain('{loading ? <div className="h-52 animate-pulse rounded-2xl bg-sand-100" />');
  });
});

describe("lease handover leftover first HTML", () => {
  it("keeps leftover handover copy in the first HTML without stealing the lease picker", () => {
    const source = readFileSync(new URL("./lease-handover-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="overlamninglista"');
    expect(source).toContain('window.location.hash !== "#overlamninglista"');
    expect(source).toContain("Överlämningen hämtas.");
    expect(source).toContain('id="valj-avtal"');
    expect(source).toContain('id="overlamning-avtal"');
    expect(source).toContain('id="spara-overlamning"');
    expect(source).toContain('id="overlamning-spara"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("saving || loading");
  });
});

describe("lease handover leftover list focus first HTML", () => {
  it("keeps leftover handover copy in the first HTML and focuses refresh after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./lease-handover-center.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="overlamninglista"');
    expect(source).toContain('id="overlamninglista-uppdatera"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#overlamninglista"');
    expect(source).toContain('id="valj-avtal"');
    expect(source).toContain('id="overlamning-avtal"');
    expect(source).toContain('document.getElementById("overlamning-avtal")?.focus()');
    expect(source).toContain('document.getElementById("overlamninglista-uppdatera")?.focus()');
    expect(source).toContain('id="spara-overlamning"');
    expect(source).toContain('id="overlamning-spara"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Överlämningen hämtas.");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="overlamninglista-uppdatera" autoFocus');
    expect(sticky).toContain('href: "/dashboard/uthyrning/overlamning#valj-avtal"');
    expect(sticky).toContain("Välj avtal");
    expect(sticky).not.toContain("#overlamninglista");
    expect(sticky).not.toContain("#overlamninglista-uppdatera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/uthyrning/overlamning", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
