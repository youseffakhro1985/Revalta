import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("service notification alert center first HTML", () => {
  it("keeps the alert filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./service-notification-alert-center.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="driftlarm"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#driftlarm"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Kvittera larm");
    expect(source).not.toContain("if (loading && !data) {");
    expect(source).not.toContain('return <div className="h-36 animate-pulse rounded-2xl border border-sand-200 bg-sand-50" aria-label="Laddar driftlarm" />');
  });
});
