import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("recurring incident SLA report export hash", () => {
  it("keeps the CSV export hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="exportera-csv"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#exportera-csv"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("format=csv");
    expect(source).toContain("autoFocus");
    expect(source).toContain('document.getElementById("exportera-csv")?.focus()');
  });
});

describe("recurring incident SLA leftover first HTML", () => {
  it("keeps leftover SLA rows in the first HTML and focuses refresh after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="sladetaljer"');
    expect(source).toContain('id="sladetaljer-uppdatera"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#sladetaljer"');
    expect(source).toContain('id="exportera-csv"');
    expect(source).toContain('document.getElementById("exportera-csv")?.focus()');
    expect(source).toContain('document.getElementById("sladetaljer-uppdatera")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("SLA-raderna hämtas.");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="sladetaljer-uppdatera" autoFocus');
    expect(source).not.toContain("Hämtar rapportdata…");
    expect(sticky).toContain("/aterkommande/incidenter/sla-rapport#exportera-csv");
    expect(sticky).toContain("Exportera CSV");
    expect(sticky).not.toContain("#sladetaljer");
    expect(sticky).not.toContain("#sladetaljer-uppdatera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/arbetsorder/aterkommande/incidenter/sla-rapport", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
