import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("inspection resolution center first HTML", () => {
  it("keeps the reconcile action in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./inspection-resolution-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="synkronisera-besiktning"');
    expect(source).toContain('id="besiktningssynk-avtal"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#synkronisera-besiktning"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("besiktningssynk-avtal")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={formLocked}");
    expect(source).toContain("Synkronisera slutförda arbetsorder");
    expect(source).not.toContain('<div className="h-28 animate-pulse rounded-xl bg-sand-100" />');
  });
});

describe("inspection resolution leftover first HTML", () => {
  it("keeps leftover inspection stats in the first HTML without stealing reconcile", () => {
    const source = readFileSync(new URL("./inspection-resolution-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="synklista"');
    expect(source).toContain('window.location.hash !== "#synklista"');
    expect(source).toContain("Besiktningen hämtas.");
    expect(source).toContain('id="synkronisera-besiktning"');
    expect(source).toContain('id="besiktningssynk-avtal"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={formLocked}");
  });
});

describe("inspection resolution leftover list focus first HTML", () => {
  it("keeps leftover inspection stats in the first HTML and focuses refresh after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./inspection-resolution-center.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="synklista"');
    expect(source).toContain('id="synklista-uppdatera"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#synklista"');
    expect(source).toContain('id="synkronisera-besiktning"');
    expect(source).toContain('id="besiktningssynk-avtal"');
    expect(source).toContain('document.getElementById("besiktningssynk-avtal")?.focus()');
    expect(source).toContain('document.getElementById("synklista-uppdatera")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Besiktningen hämtas.");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="synklista-uppdatera" autoFocus');
    expect(sticky).toContain('href: "/dashboard/uthyrning/overlamning#valj-avtal"');
    expect(sticky).toContain("Välj avtal");
    expect(sticky).not.toContain("#synklista");
    expect(sticky).not.toContain("#synklista-uppdatera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/uthyrning/overlamning", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
