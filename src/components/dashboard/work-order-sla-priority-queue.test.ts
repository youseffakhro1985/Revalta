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

  it("keeps the SLA queue filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./work-order-sla-priority-queue.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="slafilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#slafilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain("if (loading) return <div className=\"h-48 animate-pulse rounded-2xl bg-sand-100\" aria-label=\"Laddar SLA-prioritering\" />");
  });
});
