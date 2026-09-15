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
