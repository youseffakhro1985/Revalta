import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("component maintenance settings save hash", () => {
  it("keeps the maintenance plan form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./component-maintenance-settings.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-underhall"');
    expect(source).toContain('id="underhall-nasta"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-underhall"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("underhall-nasta")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading || !settings");
    expect(source).not.toContain("if (loading) return <div className=\"h-56 animate-pulse rounded-2xl bg-sand-100\" />");
  });
});
