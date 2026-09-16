import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("operational activity first HTML", () => {
  it("keeps the comment form in the first HTML and scrolls after load", () => {
    const source = readFileSync(new URL("./operational-activity-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-kommentar"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-kommentar"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("autoFocus");
    expect(source).toContain("saving || loading");
  });
});
