import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("invoice basis queue panel", () => {
  it("rebuilds attested work orders from Ekonomi without a new nav item", () => {
    const source = readFileSync(new URL("./invoice-basis-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/work-orders/invoice-basis-queue");
    expect(source).toContain("/api/work-orders/${item.id}/invoice-basis");
    expect(source).toContain('action: "rebuild"');
    expect(source).toContain("Bygg underlag");
    expect(source).toContain("Inget underlag att bygga");
    expect(source).toContain("animate-pulse");
    expect(source).toContain("Öppna");
    expect(source).toContain("status === 403");
    expect(source).toContain("Kundnamn och Markera som klar görs på arbetsordern.");
    expect(source).not.toContain('status: "ready"');
  });
});
