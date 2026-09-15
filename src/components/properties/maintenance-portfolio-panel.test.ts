import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("maintenance portfolio filter hash", () => {
  it("keeps the filter hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./maintenance-portfolio-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="portfoljfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#portfoljfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).not.toContain("if (loading) return <section className=\"space-y-6\" aria-labelledby=\"portfolio-maintenance-heading\">");
    expect(source).not.toContain("if (rows.length === 0) return <section");
  });
});
