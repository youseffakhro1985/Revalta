import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("property registry save hash", () => {
  it("keeps the save form in the first HTML and scrolls to the hash target", () => {
    const source = readFileSync(new URL("./property-registry-manager.tsx", import.meta.url), "utf8");
    expect(source).toContain('id="spara-fastighet"');
    expect(source).toContain("scroll-mt-36");
    expect(source).toContain('window.location.hash !== "#spara-fastighet"');
    expect(source).toContain("scrollIntoView");
    expect(source).toContain('autoFocus={field === "name"}');
  });
});
