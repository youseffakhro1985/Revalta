import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("team invite hash", () => {
  it("keeps the invite form hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="bjud-in"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#bjud-in"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("disabled={!canManage}");
    expect(source).not.toContain('<form id="bjud-in"');
  });
});
