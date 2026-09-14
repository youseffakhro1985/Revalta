import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work-order execution completion copy", () => {
  it("tells staff that a register vendor is emailed on finalize", () => {
    const source = readFileSync(new URL("./work-order-execution-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain("avslutmejl");
    expect(source).toContain("completion.finalize");
  });
});
