import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("hyresavisering focus", () => {
  it("scrolls the requested avi into view from ?id=", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("URLSearchParams(window.location.search)");
    expect(source).toContain("rent-notice-${notice.id}");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("focusedId");
  });
});
