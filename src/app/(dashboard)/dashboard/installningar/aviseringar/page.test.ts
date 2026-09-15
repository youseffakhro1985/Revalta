import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("aviseringar hash targets", () => {
  it("keeps aviseringsval, mottagare and historik in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="aviseringsinstallningar"');
    expect(source).toContain('id="mottagare"');
    expect(source).toContain('id="korningshistorik"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain("window.location.hash");
    expect(source).toContain('hash !== "#aviseringsinstallningar"');
    expect(source).toContain('hash !== "#mottagare"');
    expect(source).toContain('hash !== "#korningshistorik"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('href="#aviseringsinstallningar"');
    expect(source).toContain('href="#mottagare"');
    expect(source).toContain('href="#korningshistorik"');
  });
});
