import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("command center links", () => {
  it("navigates without next/link so opening search does not prefetch every module", () => {
    const source = readFileSync(new URL("./global-search.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("next/link");
    expect(source).toContain("function CommandLink");
    expect(source).toContain("router.push(href)");
    expect([...source.matchAll(/<a\b[^>]*>/g)].length).toBeGreaterThan(0);
  });
});
