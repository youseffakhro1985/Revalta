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
    expect(source).toContain("Öppna");
    expect(source).toContain("status === 403");
    expect(source).not.toContain("@fortnox");
    expect(source).not.toContain("official SDK");
  });
});

describe("invoice export queue filter first HTML", () => {
  it("keeps the queue search in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./invoice-export-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="exportkofilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#exportkofilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain("{loading ? <div className=\"h-32 animate-pulse rounded-xl bg-sand-100\" aria-hidden=\"true\" /> : null}");
  });
});

describe("invoice export leftover queue first HTML", () => {
  it("keeps leftover invoice export queue in the first HTML without stealing the search", () => {
    const source = readFileSync(new URL("./invoice-export-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="exportko"');
    expect(source).toContain('window.location.hash !== "#exportko"');
    expect(source).toContain("Kön hämtas.");
    expect(source).toContain('id="exportkofilter"');
    expect(source).not.toContain('id="exportfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
  });
});
