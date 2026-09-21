import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work-order detail ekonomi hash", () => {
  it("scrolls to the ekonomi section after the work order has loaded", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="ekonomi"');
    expect(source).toContain('window.location.hash !== "#ekonomi"');
    expect(source).toContain('getElementById("ekonomi")');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("capabilities.canViewFinance || loading");
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain("workOrder?.id || id");
  });
});

describe("work order detail save hash", () => {
  it("keeps the steering form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-arbetsorder"');
    expect(source).toContain('id="nasta-status"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-arbetsorder"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("nasta-status")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading || !workOrder || !transitions || !editable");
    expect(source).toContain("transitions?.canManage || loading || !workOrder");
    expect(source).not.toContain("if (loading) return <div className=\"h-96 animate-pulse rounded-2xl bg-sand-100\" />");
  });
});

describe("work order execution panel first HTML", () => {
  it("renders execution while the work order is still loading", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("workOrder || loading ? <WorkOrderExecutionPanel");
    expect(source).toContain("workOrder?.id || id");
  });
});

describe("work order reporting panel first HTML", () => {
  it("renders reporting while the work order is still loading", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("workOrder || loading ? <WorkOrderReportingPanel");
    expect(source).toContain("workOrder?.id || id");
  });
});

describe("work order activity panel first HTML", () => {
  it("renders comments while the work order is still loading", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("workOrder || loading ? <OperationalActivityPanel");
    expect(source).toContain("workOrder?.id || id");
    expect(source).not.toContain("h-64 animate-pulse rounded-2xl bg-sand-100");
  });
});

describe("work order leftover ekonomi start first HTML", () => {
  it("keeps leftover ekonomi in the first HTML and focuses start after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const panel = readFileSync(new URL("../../../../../components/dashboard/work-order-economics-panel.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="ekonomi"');
    expect(source).toContain('window.location.hash !== "#ekonomi"');
    expect(source).toContain('document.getElementById("ekonomi-starta")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("capabilities.canViewFinance || loading");
    expect(source).toContain('id="spara-arbetsorder"');
    expect(source).toContain('id="nasta-status"');
    expect(source).toContain('document.getElementById("nasta-status")?.focus()');
    expect(panel).toContain('id="ekonomi-starta"');
    expect(panel).toContain('id="ekonomi-starttid"');
    expect(panel).toContain('document.getElementById("ekonomi-starttid")?.focus()');
    expect(panel).not.toContain('id="ekonomi-starta" autoFocus');
    expect(panel).toContain('id="spara-ekonomi"');
    expect(sticky).toContain("${current}#spara-arbetsorder");
    expect(sticky).toContain("Spara arbetsorder");
    expect(sticky).not.toContain("#ekonomi-starta");
    expect(sticky).not.toContain("#ekonomi");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/arbetsorder", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});

describe("work order leftover metrics first HTML", () => {
  it("keeps metrics in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="ordernyckeltal"');
    expect(source).toContain('id="redigeringsstatus"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#ordernyckeltal"');
    expect(source).toContain('id="spara-arbetsorder"');
    expect(source).toContain("scrollIntoView");
    expect(source).not.toContain('loading ? <div className="h-24 animate-pulse rounded-2xl bg-sand-100" aria-hidden="true" /> : null}');
    expect(source).not.toContain(') : <div className="h-40 animate-pulse rounded-2xl bg-sand-100" aria-hidden="true" />}');
  });
});

describe("work order documents panel first HTML", () => {
  it("renders documents while the work order is still loading", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("workOrder || loading ? <OperationalDocumentsPanel");
    expect(source).toContain("workOrder?.id || id");
  });
});
