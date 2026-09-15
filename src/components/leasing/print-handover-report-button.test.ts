import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("handover report print hash", () => {
  it("keeps the print action in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./print-handover-report-button.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="skriv-ut"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#skriv-ut"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("window.print()");
  });
});
