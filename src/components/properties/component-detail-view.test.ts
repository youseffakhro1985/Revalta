import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("component detail save hash", () => {
  it("keeps the save form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./component-detail-view.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-komponent"');
    expect(source).toContain('id="komponent-namn"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-komponent"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("komponent-namn")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading || !data");
    expect(source).not.toContain("if (loading) return <div className=\"h-96 animate-pulse rounded-2xl bg-sand-100\" />");
  });
});

describe("component detail metrics first HTML", () => {
  it("keeps the metrics target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./component-detail-view.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="komponentnyckeltal"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#komponentnyckeltal"');
    expect(source).toContain('window.location.hash !== "#spara-komponent"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading || !data");
    expect(source).not.toContain(') : <div className="h-40 animate-pulse rounded-2xl bg-sand-100" aria-hidden="true" />}');
  });
});
