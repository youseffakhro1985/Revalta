import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work order SLA priority queue", () => {
  it("routes unassigned work orders to Planering instead of assigning in the SLA cards", () => {
    const source = readFileSync(new URL("./work-order-sla-priority-queue.tsx", import.meta.url), "utf8");
    expect(source).toContain("Otilldelade arbetsordrar tilldelas i Planering eller Dagens förvaltning.");
    expect(source).toContain('href="/dashboard/arbetsorder/planering"');
    expect(source).toContain("Tilldela i Planering");
    expect(source).toContain("Öppna och åtgärda");
    expect(source).not.toContain("/api/work-orders/unassigned-queue");
    expect(source).not.toContain("assignedToId");
  });
});
