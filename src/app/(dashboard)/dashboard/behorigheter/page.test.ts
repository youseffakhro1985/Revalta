import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("behorigheter hash targets", () => {
  it("keeps matris and users in the first HTML and scrolls after load", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const scroll = readFileSync(new URL("./hash-scroll.tsx", import.meta.url), "utf8");
    expect(page).toContain('id="behorighetsmatris"');
    expect(page).toContain('id="anvandare"');
    expect(page).toContain("scroll-mt-36");
    expect(page).toContain('href="#behorighetsmatris"');
    expect(page).toContain('href="#anvandare"');
    expect(page).toContain('href="/dashboard/team#bjud-in"');
    expect(scroll).toContain("window.location.hash");
    expect(scroll).toContain("scrollIntoView");
  });
});
