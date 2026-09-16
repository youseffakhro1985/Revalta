import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("notification menu first HTML", () => {
  it("keeps mark-read in the open menu without a page hash that would steal stickies", () => {
    const source = readFileSync(new URL("./notification-menu.tsx", import.meta.url), "utf8");
    expect(source).toContain("Visa alla");
    expect(source).toContain("Läst");
    expect(source).toContain("Öppna");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("Aviseringarna hämtas.");
    expect(source).not.toContain('id="aviseringar-meny"');
    expect(source).not.toContain("{loading && !data ? <div className=\"h-32 animate-pulse bg-sand-50\" /> : null}");
  });
});
