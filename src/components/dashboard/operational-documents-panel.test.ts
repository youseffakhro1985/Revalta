import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("operational documents first HTML", () => {
  it("keeps the upload form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./operational-documents-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-dokument"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-dokument"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading");
    expect(source).not.toContain("{[0, 1, 2].map((item) => <div key={item} className=\"h-20 animate-pulse rounded-2xl bg-sand-100\" />)}");
  });
});
