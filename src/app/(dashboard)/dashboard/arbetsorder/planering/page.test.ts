import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("technician planning hash", () => {
  it("keeps the workload hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="arbetsbelastning"');
    expect(source).toContain('id="fordela-arbete"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('href="#arbetsbelastning"');
    expect(source).toContain("Fördela arbete");
    expect(source).toContain("canAssign || loading");
    expect(source).toContain('window.location.hash !== "#arbetsbelastning"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("fordela-arbete")?.focus()');
  });
});

describe("planning leftover list first HTML", () => {
  it("keeps leftover workload in the first HTML and focuses refresh after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="belastningslista"');
    expect(source).toContain('id="belastningslista-uppdatera"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#belastningslista"');
    expect(source).toContain('id="arbetsbelastning"');
    expect(source).toContain('id="fordela-arbete"');
    expect(source).toContain("Fördela arbete");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("belastningslista-uppdatera")?.focus()');
    expect(source).toContain('document.getElementById("fordela-arbete")?.focus()');
    expect(source).toContain("Arbetsbelastningen hämtas.");
    expect(source).not.toContain("h-64 animate-pulse rounded-xl bg-sand-50");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="belastningslista-uppdatera" autoFocus');
    expect(source).toContain("canAssign || loading");
    expect(source).toContain("disabled={loading}");
    expect(sticky).toContain("planering#arbetsbelastning");
    expect(sticky).not.toContain("#belastningslista");
    expect(sticky).not.toContain("#belastningslista-uppdatera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
    const stickyTest = readFileSync(new URL("../../../../../components/dashboard/dashboard-primary-action.test.ts", import.meta.url), "utf8");
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/arbetsorder", "technician")).toBeNull()');
    expect(stickyTest).toContain('dashboardPrimaryCreateAction("/dashboard/boendeportal", "owner")).toBeNull()');
  });
});
