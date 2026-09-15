import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("recurring incident escalation hash", () => {
  it("keeps the escalation action in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="kontrollera-eskalering"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#kontrollera-eskalering"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
  });
});
