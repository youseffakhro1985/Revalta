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
    expect(source).toContain("Öppna");
    expect(source).toContain("status === 403");
    expect(source).not.toContain('status: "ready"');
    expect(source).not.toContain("Kundnamn och Markera som klar görs på arbetsordern.");
  });
});

describe("invoice basis queue filter first HTML", () => {
  it("keeps the queue filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./invoice-basis-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="underlagfilter"');
    expect(source).toContain('id="underlag-status"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#underlagfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("underlag-status")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain("{loading ? <div className=\"h-32 animate-pulse rounded-xl bg-sand-100\" aria-hidden=\"true\" /> : null}");
  });
});

describe("invoice basis leftover queue first HTML", () => {
  it("keeps leftover invoice basis queue in the first HTML without stealing the filter", () => {
    const source = readFileSync(new URL("./invoice-basis-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="underlagko"');
    expect(source).toContain('window.location.hash !== "#underlagko"');
    expect(source).toContain("Kön hämtas.");
    expect(source).toContain('id="underlagfilter"');
    expect(source).toContain('id="underlag-status"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
  });
});
