import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("invoice basis queue panel", () => {
  it("rebuilds attested work orders and marks lined drafts ready from Ekonomi", () => {
    const source = readFileSync(new URL("./invoice-basis-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/work-orders/invoice-basis-queue");
    expect(source).toContain("/api/work-orders/${item.id}/invoice-basis");
    expect(source).toContain('action: "rebuild"');
    expect(source).toContain('action: "markReady"');
    expect(source).toContain("Bygg underlag");
    expect(source).toContain("Markera som klar");
    expect(source).toContain("Kundnamn");
    expect(source).toContain("Inget underlag att bygga");
    expect(source).toContain("animate-pulse");
    expect(source).toContain("Öppna");
    expect(source).toContain("status === 403");
    expect(source).not.toContain('status: "ready"');
    expect(source).not.toContain("Kundnamn och Markera som klar görs på arbetsordern.");
  });
});
