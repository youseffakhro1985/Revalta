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
    expect(source).toContain("Öppna");
    expect(source).toContain("status === 403");
  });
});

describe("ticket assign queue filter first HTML", () => {
  it("keeps the queue filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./ticket-assign-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="arendefilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#arendefilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain("{loading ? <div className=\"h-32 animate-pulse rounded-xl bg-sand-100\" aria-hidden=\"true\" /> : null}");
  });
});
