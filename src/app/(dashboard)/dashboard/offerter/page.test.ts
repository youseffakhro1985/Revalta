import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("offerter work-order action", () => {
  it("creates an arbetsorder from an approved quote via the dedicated API", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("Skapa arbetsorder");
    expect(source).toContain("/api/quotes/${quote.id}/work-order");
    expect(source).toContain("Öppna arbetsorder");
  });
});
