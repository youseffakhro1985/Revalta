import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("drift secrets hash", () => {
  it("keeps the critical secrets panel in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="kritiska-secrets"');
    expect(source).toContain('id="kritiska-lank"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#kritiska-secrets"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("kritiska-lank")?.focus()');
    expect(source).toContain('href="#kritiska-secrets"');
    expect(source).toContain("Kritiska secrets");
    const healthGateIndex = source.indexOf("{health ? (");
    const secretsIndex = source.indexOf('id="kritiska-secrets"');
    expect(healthGateIndex).toBeGreaterThan(-1);
    expect(secretsIndex).toBeGreaterThan(healthGateIndex);
    expect(source.slice(secretsIndex - 80, secretsIndex)).not.toContain("{health ?");
  });
});

describe("drift leftover health first HTML", () => {
  it("keeps leftover health in the first HTML and focuses refresh after load without a second autoFocus", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const sticky = readFileSync(new URL("../../../../components/dashboard/dashboard-primary-action.ts", import.meta.url), "utf8");
    expect(source).toContain('id="systemhalsa"');
    expect(source).toContain('id="systemhalsa-uppdatera"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#systemhalsa"');
    expect(source).toContain('document.getElementById("systemhalsa-uppdatera")?.focus()');
    expect(source).toContain('id="kritiska-secrets"');
    expect(source).toContain('id="kritiska-lank"');
    expect(source).toContain('document.getElementById("kritiska-lank")?.focus()');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Systemhälsan hämtas.");
    expect(source).toContain("Kritiska secrets hämtas.");
    expect(source).toContain("disabled={loading}");
    expect((source.match(/autoFocus/g) || []).length).toBe(1);
    expect(source).not.toContain('id="systemhalsa-uppdatera" autoFocus');
    expect(source).not.toContain("h-64 animate-pulse rounded-2xl bg-sand-100");
    expect(source).not.toContain("h-24 animate-pulse rounded-2xl border border-sand-100 bg-sand-50");
    expect(sticky).toContain('href: "/dashboard/drift#kritiska-secrets"');
    expect(sticky).not.toContain("#systemhalsa");
    expect(sticky).not.toContain("#systemhalsa-uppdatera");
    expect(sticky).not.toContain("/dashboard/boendeportal");
  });
});
