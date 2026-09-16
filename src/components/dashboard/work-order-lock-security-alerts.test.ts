import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work-order lock security alerts first HTML", () => {
  it("keeps refresh and mark-read in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./work-order-lock-security-alerts.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="lasavisering"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#lasavisering"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Uppdatera");
    expect(source).toContain("Markera alla lästa");
    expect(source).not.toContain("if (!loading && !error && !data?.notifications.length) return null;");
    expect(source).not.toContain('{loading && !data ? <div className="h-28 animate-pulse bg-sand-50" aria-label="Laddar säkerhetsaviseringar" /> : null}');
  });
});

describe("work-order lock leftover first HTML", () => {
  it("keeps leftover lock alerts in the first HTML without stealing refresh", () => {
    const source = readFileSync(new URL("./work-order-lock-security-alerts.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="laslista"');
    expect(source).toContain('window.location.hash !== "#laslista"');
    expect(source).toContain("Aviseringarna hämtas.");
    expect(source).toContain('id="lasavisering"');
    expect(source).toContain('id="lasavisering-uppdatera"');
    expect(source).toContain("autoFocus");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("disabled={loading}");
  });
});
