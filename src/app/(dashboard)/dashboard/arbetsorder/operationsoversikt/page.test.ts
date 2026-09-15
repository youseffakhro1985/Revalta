import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work order operations overview filter hash", () => {
  it("keeps the queue filter hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="oversiktsfilter"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#oversiktsfilter"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
  });
});
