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

describe("aviseringar history filter first HTML", () => {
  it("keeps the history filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="historikfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#historikfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain("{loading && !data ? <div className=\"h-48 animate-pulse rounded-xl bg-sand-100\" /> : null}");
  });
});
