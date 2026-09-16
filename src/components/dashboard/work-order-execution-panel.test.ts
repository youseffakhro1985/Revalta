import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work-order execution completion copy", () => {
  it("tells staff that a register vendor is emailed on finalize", () => {
    const source = readFileSync(new URL("./work-order-execution-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain("avslutmejl");
    expect(source).toContain("Kopplat ärende meddelar anmälaren");
    expect(source).toContain("completion.finalize");
    expect(source).toContain("bygga fakturaunderlag");
    expect(source).toContain("spara utkast skapar inte rader");
  });
});

describe("work-order execution first HTML", () => {
  it("keeps the checklist create form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./work-order-execution-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-utforande"');
    expect(source).toContain('id="utforande-rubrik"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-utforande"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('document.getElementById("utforande-rubrik")?.focus()');
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading");
    expect(source).toContain("canMutate || loading");
    expect(source).not.toContain("if (loading) return <div className=\"h-96 animate-pulse rounded-2xl bg-sand-100\" aria-label=\"Laddar arbetsorderutförande\" />");
  });
});
