import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("leverantorer create hash", () => {
  it("keeps the hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="ny-leverantor"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#ny-leverantor"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
  });
});

describe("leverantorer search filter first HTML", () => {
  it("keeps the search filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="leverantorfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#leverantorfilter"');
    expect(source).toContain('id="ny-leverantor"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("saving || loading");
    expect(source).not.toContain('{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-sand-100" />)}');
  });
});
