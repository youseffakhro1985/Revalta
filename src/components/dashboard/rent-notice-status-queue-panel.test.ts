import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("rent notice status queue panel", () => {
  it("updates manual avi status from Ekonomi without a new nav item or bank integration", () => {
    const source = readFileSync(new URL("./rent-notice-status-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/rent-notices/status-queue");
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain("noticeId: item.id");
    expect(source).toContain("item.nextStatusLabel");
    expect(source).toContain("Markera som förfallen");
    expect(source).toContain("Inga avier att hantera");
    expect(source).toContain("Öppna");
    expect(source).toContain("status === 403");
    expect(source).toContain("utanför Revalta");
    expect(source).not.toContain('href="/dashboard/hyresavisering"');
    expect(source).not.toContain("stripe");
  });
});

describe("rent notice queue filter first HTML", () => {
  it("keeps the queue filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./rent-notice-status-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="avikofilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#avikofilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain("{loading ? <div className=\"h-32 animate-pulse rounded-xl bg-sand-100\" aria-hidden=\"true\" /> : null}");
  });
});

describe("rent notice leftover queue first HTML", () => {
  it("keeps leftover rent notice queue in the first HTML without stealing the filter", () => {
    const source = readFileSync(new URL("./rent-notice-status-queue-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="aviko"');
    expect(source).toContain('window.location.hash !== "#aviko"');
    expect(source).toContain("Kön hämtas.");
    expect(source).toContain('id="avikofilter"');
    expect(source).not.toContain('id="avilista"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
  });
});
