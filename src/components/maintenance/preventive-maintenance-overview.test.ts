import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("preventive maintenance run hash", () => {
  it("keeps the run-engine action in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./preventive-maintenance-overview.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="kor-motor"');
    expect(source).toContain('id="kor-motor-knapp"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#kor-motor"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("kor-motor-knapp")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("data?.canRun || loading");
    expect(source).not.toContain("if (loading) return <div className=\"h-96 animate-pulse");
    expect(source).not.toContain("if (!data) return null");
  });
});

describe("preventive maintenance service filter first HTML", () => {
  it("keeps the service filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./preventive-maintenance-overview.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="servicefilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#servicefilter"');
    expect(source).toContain('window.location.hash !== "#kor-motor"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Kör underhållsmotorn");
    expect(source).not.toContain('{loading && !data ? <div className="h-48 animate-pulse rounded-xl bg-sand-100" aria-hidden="true" /> : null}');
  });
});

describe("preventive maintenance leftover overview first HTML", () => {
  it("keeps leftover service rows in the first HTML without stealing run or filter", () => {
    const source = readFileSync(new URL("./preventive-maintenance-overview.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="serviceoversikt"');
    expect(source).toContain('window.location.hash !== "#serviceoversikt"');
    expect(source).toContain("Serviceöversikten hämtas.");
    expect(source).toContain('id="kor-motor"');
    expect(source).toContain('id="kor-motor-knapp"');
    expect(source).toContain('id="servicefilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("data?.canRun || loading");
  });
});
