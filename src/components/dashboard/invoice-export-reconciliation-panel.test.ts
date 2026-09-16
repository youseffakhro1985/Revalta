import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("invoice export reconciliation first HTML", () => {
  it("keeps Avstämningsnotering in the first HTML without stealing Spara arbetsorder", () => {
    const source = readFileSync(new URL("./invoice-export-reconciliation-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="avstamma-export"');
    expect(source).toContain('noteId="avstamma-notering"');
    expect(source).toContain("id={noteId}");
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#avstamma-export"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("avstamma-notering")?.focus()');
    expect(source).toContain("Bekräfta skickad");
    expect(source).toContain("Avstämningsnotering");
    expect(source).toContain("if (!loading && !visible && !error && !success) return null");
    expect(source).not.toContain("if (loading || (!visible && !error && !success)) return null");
    expect(source).not.toContain("autoFocus");
    expect(source).not.toContain("hämtas");
    expect(source).not.toContain("Laddar");
  });
});
