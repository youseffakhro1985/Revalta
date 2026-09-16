import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("operational activity first HTML", () => {
  it("keeps the comment form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./operational-activity-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-kommentar"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-kommentar"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading");
  });
});

describe("operational activity history filter first HTML", () => {
  it("keeps the history filter in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./operational-activity-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="aktivitetsfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#aktivitetsfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain('id="spara-kommentar"');
    expect(source).not.toContain("{[0, 1, 2].map((item) => <div key={item} className=\"h-24 animate-pulse rounded-2xl bg-sand-100\" />)}");
    expect(source).not.toContain("{[0, 1, 2, 3].map((item) => <div key={item} className=\"h-20 animate-pulse rounded-2xl bg-sand-100\" />)}");
  });
});
