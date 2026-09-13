import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("command center links", () => {
  it("navigates with buttons so opening search cannot prefetch in-app hrefs", () => {
    const source = readFileSync(new URL("./global-search.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("next/link");
    expect(source).not.toMatch(/<a[\s>]/);
    expect(source).toContain("function CommandLink");
    expect(source).toContain("router.push(href)");
    expect(source).toContain('<button type="button"');
  });
});
