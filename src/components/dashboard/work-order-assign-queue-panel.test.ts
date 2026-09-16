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
    expect(source).toContain("status === 403");
    expect(source).toContain("status === 423");
  });
});

describe("work order assign queue filter first HTML", () => {
  it("keeps the queue filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./work-order-assign-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="tilldelafilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#tilldelafilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain("{loading ? <div className=\"h-32 animate-pulse rounded-xl bg-sand-100\" aria-hidden=\"true\" /> : null}");
  });
});

describe("work order assign leftover queue first HTML", () => {
  it("keeps leftover assign queue in the first HTML without stealing the filter", () => {
    const source = readFileSync(new URL("./work-order-assign-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="tilldelako"');
    expect(source).toContain('window.location.hash !== "#tilldelako"');
    expect(source).toContain("Kön hämtas.");
    expect(source).toContain('id="tilldelafilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
  });
});
