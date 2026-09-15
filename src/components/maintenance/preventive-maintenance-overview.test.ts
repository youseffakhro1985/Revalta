import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("preventive maintenance run hash", () => {
  it("keeps the run-engine action in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./preventive-maintenance-overview.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="kor-motor"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#kor-motor"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("data?.canRun || loading");
    expect(source).not.toContain("if (loading) return <div className=\"h-96 animate-pulse");
    expect(source).not.toContain("if (!data) return null");
  });
});
