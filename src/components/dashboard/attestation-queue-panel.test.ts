import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("attestation queue panel", () => {
  it("loads the finance queue and attests submitted rows without leaving Ekonomi", () => {
    const source = readFileSync(new URL("./attestation-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('/api/work-orders/attestation-queue');
    expect(source).toContain("/api/work-orders/${item.id}/attestation");
    expect(source).toContain("Attesteringskö");
    expect(source).toContain("Inget att attestera");
    expect(source).toContain("animate-pulse");
    expect(source).toContain("Godkänn inskickade");
    expect(source).toContain("Avvisa inskickade");
    expect(source).toContain("approveSubmitted");
    expect(source).toContain("rejectSubmitted");
    expect(source).toContain("window.confirm");
    expect(source).toContain("Öppna");
    expect(source).toContain("status === 403");
  });
});
