import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("component entry corrections hash", () => {
  it("keeps the correction form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./component-entry-corrections.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="korrigera-historik"');
    expect(source).toContain('id="historik-datum"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#korrigera-historik"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("historik-datum")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading");
    expect(source).not.toContain("if (loading) return <div className=\"h-48 animate-pulse rounded-2xl bg-sand-100\" />");
  });
});
