import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("inspection work-order center first HTML", () => {
  it("keeps the create action in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./inspection-work-order-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="skapa-besiktningsorder"');
    expect(source).toContain('id="besiktningsorder-avtal"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#skapa-besiktningsorder"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("besiktningsorder-avtal")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={formLocked}");
    expect(source).toContain("Skapa arbetsorder");
    expect(source).not.toContain('{loading ? <div className="h-36 animate-pulse rounded-xl bg-sand-100" />');
  });
});

describe("inspection work-order leftover first HTML", () => {
  it("keeps leftover inspection points in the first HTML without stealing create", () => {
    const source = readFileSync(new URL("./inspection-work-order-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="punktlista"');
    expect(source).toContain('window.location.hash !== "#punktlista"');
    expect(source).toContain("Punkterna hämtas.");
    expect(source).toContain('id="skapa-besiktningsorder"');
    expect(source).toContain('id="besiktningsorder-avtal"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={formLocked}");
  });
});

describe("inspection work-order leftover list focus first HTML", () => {
  it("keeps leftover inspection points in the first HTML and focuses refresh after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./inspection-work-order-center.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="punktlista"');
    expect(source).toContain('id="punktlista-uppdatera"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#punktlista"');
    expect(source).toContain('id="skapa-besiktningsorder"');
    expect(source).toContain('id="besiktningsorder-avtal"');
    expect(source).toContain('document.getElementById("besiktningsorder-avtal")?.focus()');
    expect(source).toContain('document.getElementById("punktlista-uppdatera")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Punkterna hämtas.");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="punktlista-uppdatera" autoFocus');
    expect(sticky).toContain('href: "/dashboard/uthyrning/overlamning#valj-avtal"');
    expect(sticky).toContain("Välj avtal");
    expect(sticky).not.toContain("#punktlista");
    expect(sticky).not.toContain("#punktlista-uppdatera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/uthyrning/overlamning", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
