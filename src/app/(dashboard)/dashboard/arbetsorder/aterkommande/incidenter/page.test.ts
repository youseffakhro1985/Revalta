import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("recurring incident escalation hash", () => {
  it("keeps the escalation action in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="kontrollera-eskalering"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#kontrollera-eskalering"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain('id="kontrollera-eskalering-knapp"');
    expect(source).toContain('document.getElementById("kontrollera-eskalering-knapp")?.focus()');
  });
});

describe("recurring incident leftover list first HTML", () => {
  it("keeps leftover incidents in the first HTML without stealing escalation", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="incidentlista"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#incidentlista"');
    expect(source).toContain('id="kontrollera-eskalering"');
    expect(source).toContain('id="kontrollera-eskalering-knapp"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Incidenterna hämtas.");
    expect(source).not.toContain("Hämtar incidenter…");
  });
});

describe("recurring incident leftover list focus first HTML", () => {
  it("keeps leftover incidents in the first HTML and focuses refresh after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="incidentlista"');
    expect(source).toContain('id="incidentlista-uppdatera"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#incidentlista"');
    expect(source).toContain('id="kontrollera-eskalering"');
    expect(source).toContain('id="kontrollera-eskalering-knapp"');
    expect(source).toContain('document.getElementById("kontrollera-eskalering-knapp")?.focus()');
    expect(source).toContain('document.getElementById("incidentlista-uppdatera")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Incidenterna hämtas.");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="incidentlista-uppdatera" autoFocus');
    expect(source).not.toContain("Hämtar incidenter…");
    expect(sticky).toContain("/aterkommande/incidenter#kontrollera-eskalering");
    expect(sticky).toContain("Kontrollera eskalering");
    expect(sticky).not.toContain("#incidentlista");
    expect(sticky).not.toContain("#incidentlista-uppdatera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/arbetsorder/aterkommande/incidenter", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
