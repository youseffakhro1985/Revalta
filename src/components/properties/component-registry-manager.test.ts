import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("component registry save hash", () => {
  it("keeps the save form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./component-registry-manager.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-komponentregister"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-komponentregister"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading || !assetId");
    expect(source).not.toContain("if (loading) return <div className=\"h-80 animate-pulse rounded-2xl bg-sand-100\" />");
  });
});
