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
  it("keeps search and recent orders in the first HTML without stealing create", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="orderfilter"');
    expect(source).toContain('id="senasteordrar"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#orderfilter"');
    expect(source).toContain('window.location.hash !== "#senasteordrar"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("canManage || loading");
    expect(source).toContain("Ny arbetsorder");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Arbetsordrarna hämtas.");
    expect(source).not.toContain('Empty title={loading ? "Läser arbetsordrar…"');
  });

  it("keeps today's planning leftover in the first HTML without stealing create", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="dagensplanering"');
    expect(source).toContain('window.location.hash !== "#dagensplanering"');
    expect(source).toContain("Dagens planering hämtas.");
    expect(source).not.toContain('Empty title={loading ? "Läser dagens planering…"');
    expect(source).toContain("Ny arbetsorder");
    expect(source).toContain("/dashboard/arbetsorder/ny");
  });
});
