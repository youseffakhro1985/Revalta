import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("notiser create hash", () => {
  it("keeps the publish form hash target in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="nytt-meddelande"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#nytt-meddelande"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("canManage || loading");
    expect(source).toContain("autoFocus");
    expect(source).toContain("fieldset");
    expect(source).not.toContain('<form id="nytt-meddelande"');
  });
});
