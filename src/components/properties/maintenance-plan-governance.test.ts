import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("maintenance plan governance hash", () => {
  it("keeps approve and archive actions in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./maintenance-plan-governance.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="godkann-plan"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#godkann-plan"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading || !data");
    expect(source).toContain("Godkänn version");
    expect(source).not.toContain("if (loading) return <div className=\"h-56 animate-pulse rounded-2xl bg-sand-100\" />");
  });
});
