import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("rapporter filter hash", () => {
  it("keeps the filter toolbar hash target in the first HTML", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(page).toContain('id="rapportfilter"');
    expect(page).toContain("scroll-mt-36");
  });

  it("scrolls to the toolbar after load", () => {
    const toolbar = readFileSync(new URL("../../../../components/reports/reports-toolbar.tsx", import.meta.url), "utf8");
    expect(toolbar).toContain('window.location.hash !== "#rapportfilter"');
    expect(toolbar).toContain("scrollIntoView");
    expect(toolbar).toContain("autoFocus");
  });
});
