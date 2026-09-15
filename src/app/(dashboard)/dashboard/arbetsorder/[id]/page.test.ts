import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work-order detail ekonomi hash", () => {
  it("scrolls to the ekonomi section after the work order has loaded", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="ekonomi"');
    expect(source).toContain('window.location.hash !== "#ekonomi"');
    expect(source).toContain('getElementById("ekonomi")');
    expect(source).toContain("scrollIntoView");
  });
});
