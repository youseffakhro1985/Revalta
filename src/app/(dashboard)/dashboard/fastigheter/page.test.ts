import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fastigheter index", () => {
  it("opens each property through a real href instead of a clickable row", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('href={`/dashboard/fastigheter/${property.id}`}');
    expect(source).toContain("aria-label={`Öppna ${property.name}`}");
    expect(source).not.toContain('role="link"');
    expect(source).not.toContain("router.push(`/dashboard/fastigheter/${property.id}`)");
  });
});

describe("fastigheter leftover filter first HTML", () => {
  it("keeps the filter in the first HTML and scrolls after load without stealing create", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="fastighetsfilter"');
    expect(source).toContain('id="fastighet-sok"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#fastighetsfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("fastighet-sok")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain('href="/dashboard/fastigheter/ny"');
    expect(source).toContain("Ny fastighet");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Fastigheterna hämtas.");
    expect(source).not.toContain('className="h-12 animate-pulse rounded-xl bg-sand-100"');
  });
});

describe("fastigheter leftover list first HTML", () => {
  it("keeps leftover properties in the first HTML and focuses sort after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="fastighetslista"');
    expect(source).toContain('id="fastighetslista-sortera"');
    expect(source).toContain('window.location.hash !== "#fastighetslista"');
    expect(source).toContain("Fastigheterna hämtas.");
    expect(source).toContain('id="fastighetsfilter"');
    expect(source).toContain('id="fastighet-sok"');
    expect(source).toContain('document.getElementById("fastighet-sok")?.focus()');
    expect(source).toContain('document.getElementById("fastighetslista-sortera")?.focus()');
    expect(source).toContain('href="/dashboard/fastigheter/ny"');
    expect(source).toContain("Ny fastighet");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="fastighetslista-sortera" autoFocus');
    expect(sticky).toContain("Ny fastighet");
    expect(sticky).not.toContain("#fastighetslista");
    expect(sticky).not.toContain("#fastighetslista-sortera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/fastigheter", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
