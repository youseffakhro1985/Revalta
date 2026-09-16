import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work-order detail ekonomi hash", () => {
  it("scrolls to the ekonomi section after the work order has loaded", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="ekonomi"');
    expect(source).toContain('window.location.hash !== "#ekonomi"');
    expect(source).toContain('getElementById("ekonomi")');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("capabilities.canViewFinance || loading");
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain("workOrder?.id || id");
  });
});

describe("work order detail save hash", () => {
  it("keeps the steering form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-arbetsorder"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-arbetsorder"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading || !workOrder || !transitions || !editable");
    expect(source).toContain("transitions?.canManage || loading || !workOrder");
    expect(source).not.toContain("if (loading) return <div className=\"h-96 animate-pulse rounded-2xl bg-sand-100\" />");
  });
});
