import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("demo page", () => {
  it("paints sent and reason notices from the URL on the first HTML response", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("searchParams");
    expect(source).toContain("initialSent={params.sent === \"1\"}");
    expect(source).toContain("initialReason={params.reason}");
  });
});
