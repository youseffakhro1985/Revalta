import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("bokningar create hash", () => {
  it("keeps the hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="ny-bokning"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#ny-bokning"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("canManage || loading");
    expect(source).toContain("autoFocus");
    expect(source).not.toContain('<form id="ny-bokning"');
  });
});
