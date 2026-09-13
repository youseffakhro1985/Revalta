import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("command center links", () => {
  it("disables Next.js prefetch so opening search does not stampede the data plane", () => {
    const source = readFileSync(new URL("./global-search.tsx", import.meta.url), "utf8");
    const links = [...source.matchAll(/<Link\b[^>]*>/g)].map((match) => match[0]);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toContain("prefetch={false}");
    }
  });
});
