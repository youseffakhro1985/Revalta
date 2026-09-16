import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("kalender create hash", () => {
  it("keeps the hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="ny-aktivitet"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#ny-aktivitet"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("canManage || loading");
    expect(source).toContain("autoFocus");
    expect(source).not.toContain('<form id="ny-aktivitet"');
  });
});

describe("kalender filter first HTML", () => {
  it("keeps the timeline filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="kalenderfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#kalenderfilter"');
    expect(source).toContain('id="ny-aktivitet"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("saving || loading");
    expect(source).not.toContain('<div className="h-64 animate-pulse rounded-xl bg-sand-100" aria-hidden="true" />');
    expect(source).not.toContain('{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-sand-100" />)}');
  });
});
