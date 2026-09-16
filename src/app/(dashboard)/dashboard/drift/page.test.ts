import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("drift secrets hash", () => {
  it("keeps the critical secrets panel in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="kritiska-secrets"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#kritiska-secrets"');
    expect(source).toContain("scrollIntoView");
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
  it("keeps leftover health in the first HTML without stealing secrets", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="systemhalsa"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#systemhalsa"');
    expect(source).toContain('id="kritiska-secrets"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Systemhälsan hämtas.");
    expect(source).toContain("Kritiska secrets hämtas.");
    expect(source).not.toContain("h-64 animate-pulse rounded-2xl bg-sand-100");
    expect(source).not.toContain("h-24 animate-pulse rounded-2xl border border-sand-100 bg-sand-50");
  });
});
