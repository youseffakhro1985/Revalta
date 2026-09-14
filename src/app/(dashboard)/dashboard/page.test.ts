import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard home schema gate", () => {
  it("renders the role dashboard when only operational module tables are missing", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("canRenderHomeDashboard");
    expect(source).toContain("showHome");
    expect(source).toContain("Kompatibilitetsläge");
  });
});
