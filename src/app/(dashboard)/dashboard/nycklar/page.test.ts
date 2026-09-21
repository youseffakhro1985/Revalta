import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("nycklar create hash", () => {
  it("keeps the register form hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="ny-nyckel"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#ny-nyckel"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('id="nyckel-fastighet"');
    expect(source).toContain('document.getElementById("nyckel-fastighet")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).not.toContain('<form id="ny-nyckel"');
  });
});

describe("nycklar leftover register first HTML", () => {
  it("keeps leftover register in the first HTML without stealing Ny nyckel", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="nyckelfilter"');
    expect(source).toContain('id="nyckellista"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#nyckelfilter"');
    expect(source).toContain('window.location.hash !== "#nyckellista"');
    expect(source).toContain('id="ny-nyckel"');
    expect(source).toContain('id="nyckel-fastighet"');
    expect(source).toContain('id="nyckel-sok"');
    expect(source).toContain('document.getElementById("nyckel-sok")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Nycklarna hämtas.");
    expect(source).not.toContain("LoadingState");
    expect(source).not.toContain("Hämtar nyckelregister…");
  });
});

describe("nycklar leftover register list first HTML", () => {
  it("keeps leftover keys in the first HTML and focuses export after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="nyckellista"');
    expect(source).toContain('id="nyckellista-csv"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#nyckellista"');
    expect(source).toContain('id="ny-nyckel"');
    expect(source).toContain('id="nyckel-fastighet"');
    expect(source).toContain('document.getElementById("nyckel-fastighet")?.focus()');
    expect(source).toContain('document.getElementById("nyckellista-csv")?.focus()');
    expect(source).toContain('id="nyckelfilter"');
    expect(source).toContain('id="nyckel-sok"');
    expect(source).toContain('document.getElementById("nyckel-sok")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Nycklarna hämtas.");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="nyckellista-csv" autoFocus');
    expect(source).not.toContain("Hämtar nyckelregister…");
    expect(sticky).toContain('href: "/dashboard/nycklar#ny-nyckel"');
    expect(sticky).toContain("Ny nyckel");
    expect(sticky).not.toContain("#nyckellista");
    expect(sticky).not.toContain("#nyckellista-csv");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/nycklar", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
