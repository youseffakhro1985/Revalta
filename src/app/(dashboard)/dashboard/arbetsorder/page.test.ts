import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("arbetsorder notify copy", () => {
  it("tells staff that assigning a vendor emails the register contact", () => {
    const createPage = readFileSync(new URL("./ny/page.tsx", import.meta.url), "utf8");
    const detailPage = readFileSync(new URL("./[id]/page.tsx", import.meta.url), "utf8");
    expect(createPage).toContain("mejlas leverantörens kontaktadress i registret");
    expect(detailPage).toContain("Vid koppling, paus, avbrott, återupptagning och avslut mejlas leverantörens kontaktadress i registret");
  });

  it("tells staff that pause, cancel, resume and complete email the assignee", () => {
    const detailPage = readFileSync(new URL("./[id]/page.tsx", import.meta.url), "utf8");
    expect(detailPage).toContain("Vid tilldelning, paus, avbrott, återupptagning och avslut mejlas den ansvariga");
  });
});

describe("arbetsorder leftover list first HTML", () => {
  it("keeps search and recent orders in the first HTML and focuses Visa alla after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="orderfilter"');
    expect(source).toContain('id="order-sok"');
    expect(source).toContain('id="senasteordrar"');
    expect(source).toContain('id="senasteordrar-alla"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#orderfilter"');
    expect(source).toContain('window.location.hash !== "#senasteordrar"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("order-sok")?.focus()');
    expect(source).toContain('document.getElementById("senasteordrar-alla")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("canManage || loading");
    expect(source).toContain("Ny arbetsorder");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Arbetsordrarna hämtas.");
    expect(source).not.toContain('Empty title={loading ? "Läser arbetsordrar…"');
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="senasteordrar-alla" autoFocus');
    expect(source).toContain('id="dagensplanering-alla"');
    expect(source).toContain('document.getElementById("dagensplanering-alla")?.focus()');
    expect(sticky).toContain('href: `${workOrdersRoot}/ny`');
    expect(sticky).not.toContain("#senasteordrar");
    expect(sticky).not.toContain("#senasteordrar-alla");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/arbetsorder", "technician")).toBeNull()');
  });

  it("keeps today's planning leftover in the first HTML and focuses Visa alla after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="dagensplanering"');
    expect(source).toContain('id="dagensplanering-alla"');
    expect(source).toContain('window.location.hash !== "#dagensplanering"');
    expect(source).toContain('document.getElementById("dagensplanering-alla")?.focus()');
    expect(source).toContain("Dagens planering hämtas.");
    expect(source).not.toContain('Empty title={loading ? "Läser dagens planering…"');
    expect(source).toContain("Ny arbetsorder");
    expect(source).toContain("/dashboard/arbetsorder/ny");
    expect(source).toContain('id="order-sok"');
    expect(source).toContain('document.getElementById("order-sok")?.focus()');
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="dagensplanering-alla" autoFocus');
    expect(sticky).toContain('href: `${workOrdersRoot}/ny`');
    expect(sticky).not.toContain("#dagensplanering");
    expect(sticky).not.toContain("#dagensplanering-alla");
    expect(sticky).not.toContain("#senasteordrar-alla");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/arbetsorder", "technician")).toBeNull()');
  });
});
