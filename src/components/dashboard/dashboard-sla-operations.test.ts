import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard SLA operations", () => {
  it("sends unassigned SLA counts to Planering instead of assigning inline", () => {
    const source = readFileSync(new URL("./dashboard-sla-operations.tsx", import.meta.url), "utf8");
    expect(source).toContain("Otilldelade arbetsordrar tilldelas i Planering eller Dagens förvaltning.");
    expect(source).toContain('href: "/dashboard/arbetsorder/planering"');
    expect(source).toContain("Tilldela i Planering");
    expect(source).not.toContain("/api/work-orders/unassigned-queue");
  });

  it("requires staff before loading work orders or assignee emails", () => {
    const source = readFileSync(new URL("./dashboard-sla-operations.tsx", import.meta.url), "utf8");
    expect(source).toContain("requireCompanyUser");
    expect(source.indexOf("requireCompanyUser")).toBeLessThan(source.indexOf("workOrder.findMany"));
    expect(source).toContain("if (!user) return null");
  });
});
