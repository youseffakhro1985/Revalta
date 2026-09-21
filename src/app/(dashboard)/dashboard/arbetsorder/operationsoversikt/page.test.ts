import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work order operations overview filter hash", () => {
  it("keeps the queue filter hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="oversiktsfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#oversiktsfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain('id="oversikt-oppna"');
    expect(source).toContain('document.getElementById("oversikt-oppna")?.focus()');
  });
});

describe("work order operations leftover queue first HTML", () => {
  it("keeps leftover queue in the first HTML without stealing filter", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="operativko"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#operativko"');
    expect(source).toContain('id="oversiktsfilter"');
    expect(source).toContain('id="oversikt-oppna"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Arbetsordrarna hämtas.");
    expect(source).not.toContain("h-56 animate-pulse rounded-xl bg-sand-100");
  });
});

describe("work order operations leftover queue focus first HTML", () => {
  it("keeps leftover queue in the first HTML and focuses refresh after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="operativko"');
    expect(source).toContain('id="operativko-uppdatera"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#operativko"');
    expect(source).toContain('id="oversiktsfilter"');
    expect(source).toContain('id="oversikt-oppna"');
    expect(source).toContain('document.getElementById("oversikt-oppna")?.focus()');
    expect(source).toContain('document.getElementById("operativko-uppdatera")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Arbetsordrarna hämtas.");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="operativko-uppdatera" autoFocus');
    expect(source).not.toContain("h-56 animate-pulse rounded-xl bg-sand-100");
    expect(sticky).toContain("/operationsoversikt#oversiktsfilter");
    expect(sticky).toContain("Filtrera kö");
    expect(sticky).not.toContain("#operativko");
    expect(sticky).not.toContain("#operativko-uppdatera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/arbetsorder/operationsoversikt", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
