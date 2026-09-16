import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public underhallsrapport print first HTML", () => {
  it("keeps the print action in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="skriv-ut"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash!=="#skriv-ut"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain('if(!data)return <main className="mx-auto max-w-5xl p-10"><div className="h-96 animate-pulse rounded-2xl bg-sand-100"/></main>');
  });
});
