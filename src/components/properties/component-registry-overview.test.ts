import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("component registry overview", () => {
  it("keeps the hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./component-registry-overview.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="component-registry-heading"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#component-registry-heading"');
    expect(source).toContain("scrollIntoView");
    expect(source).not.toContain("if (loading) return <div className=\"h-96 animate-pulse rounded-2xl bg-sand-100\" />");
  });
});
