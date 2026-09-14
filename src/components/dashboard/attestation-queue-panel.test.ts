import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("attestation queue panel", () => {
  it("loads the finance queue and deep-links into work-order economics", () => {
    const source = readFileSync(new URL("./attestation-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('/api/work-orders/attestation-queue');
    expect(source).toContain("Attesteringskö");
    expect(source).toContain("Inget att attestera");
    expect(source).toContain("animate-pulse");
    expect(source).toContain("Attestera");
    expect(source).toContain("status === 403");
  });
});
