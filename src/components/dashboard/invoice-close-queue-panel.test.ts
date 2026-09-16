import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("invoice close queue panel", () => {
  it("marks completed work orders invoiced from Ekonomi with the existing edit lock", () => {
    const source = readFileSync(new URL("./invoice-close-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/work-orders/invoice-close-queue");
    expect(source).toContain("/api/work-orders/${item.id}/edit-lock");
    expect(source).toContain("/api/work-orders/${item.id}/locked-update");
    expect(source).toContain('action: "acquire"');
    expect(source).toContain('action: "release"');
    expect(source).toContain('status: "invoiced"');
    expect(source).toContain("Markera som fakturerad");
    expect(source).toContain("Inget att fakturera");
    expect(source).toContain("Öppna");
    expect(source).toContain("status === 403");
    expect(source).toContain("status === 423");
  });
});

describe("invoice close queue filter first HTML", () => {
  it("keeps the queue search in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./invoice-close-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="fakturafilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#fakturafilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain("{loading ? <div className=\"h-32 animate-pulse rounded-xl bg-sand-100\" aria-hidden=\"true\" /> : null}");
  });
});

describe("invoice close leftover queue first HTML", () => {
  it("keeps leftover invoice close queue in the first HTML without stealing the search", () => {
    const source = readFileSync(new URL("./invoice-close-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="fakturako"');
    expect(source).toContain('window.location.hash !== "#fakturako"');
    expect(source).toContain("Kön hämtas.");
    expect(source).toContain('id="fakturafilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
  });
});
