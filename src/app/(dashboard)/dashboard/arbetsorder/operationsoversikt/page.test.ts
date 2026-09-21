import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work order operations overview filter hash", () => {
  it("keeps the queue filter hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="oversiktsfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#oversiktsfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain('id="oversikt-oppna"');
    expect(source).toContain('document.getElementById("oversikt-oppna")?.focus()');
  });
});

describe("work order operations leftover queue first HTML", () => {
  it("keeps leftover queue in the first HTML without stealing filter", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="operativko"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#operativko"');
    expect(source).toContain('id="oversiktsfilter"');
    expect(source).toContain('id="oversikt-oppna"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("Arbetsordrarna hämtas.");
    expect(source).not.toContain("h-56 animate-pulse rounded-xl bg-sand-100");
  });
});
