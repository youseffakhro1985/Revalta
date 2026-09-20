import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("maintenance action save hash", () => {
  it("keeps the action form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./maintenance-action-manager.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-underhallsatgard"');
    expect(source).toContain('id="atgard-namn"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-underhallsatgard"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("atgard-namn")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading || !selected");
    expect(source).not.toContain("if (loading) return <div className=\"h-72 animate-pulse rounded-2xl bg-sand-100\" />");
  });
});
