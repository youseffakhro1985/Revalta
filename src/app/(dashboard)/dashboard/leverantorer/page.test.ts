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
