import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("invoice export queue panel", () => {
  it("queues ready invoice drafts from Ekonomi without a new nav item or SDK", () => {
    const source = readFileSync(new URL("./invoice-export-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/work-orders/invoice-export-queue");
    expect(source).toContain("/api/work-orders/${item.id}/invoice-integration");
    expect(source).toContain('action: "queue"');
    expect(source).toContain("Köa export");
    expect(source).toContain("Inget att exportera");
    expect(source).toContain("animate-pulse");
    expect(source).toContain("Öppna");
    expect(source).toContain("status === 403");
    expect(source).not.toContain("@fortnox");
    expect(source).not.toContain("official SDK");
  });
});
