import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work order assign queue panel", () => {
  it("assigns unassigned work orders via the edit lock from the manager overview", () => {
    const source = readFileSync(new URL("./work-order-assign-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/work-orders/unassigned-queue");
    expect(source).toContain("/api/work-orders/${item.id}/edit-lock");
    expect(source).toContain("/api/work-orders/${item.id}/locked-update");
    expect(source).toContain("assignedToId: assigneeId");
    expect(source).toContain('action: "acquire"');
    expect(source).toContain('action: "release"');
    expect(source).toContain("Tilldela");
    expect(source).toContain("Inga otilldelade arbetsordrar");
    expect(source).toContain("animate-pulse");
    expect(source).toContain("status === 403");
    expect(source).toContain("status === 423");
  });
});
