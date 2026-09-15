import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ticket assign queue panel", () => {
  it("assigns unassigned tickets from the manager overview without a new nav item", () => {
    const source = readFileSync(new URL("./ticket-assign-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/tickets/unassigned-queue");
    expect(source).toContain("/api/tickets/${item.id}");
    expect(source).toContain("assignedToId: assigneeId");
    expect(source).toContain("Tilldela");
    expect(source).toContain("Inga otilldelade ärenden");
    expect(source).toContain("animate-pulse");
    expect(source).toContain("Öppna");
    expect(source).toContain("status === 403");
  });
});
