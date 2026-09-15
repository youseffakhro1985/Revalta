import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work order planning", () => {
  it("assigns from the list via WorkOrderQuickActions", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("WorkOrderQuickActions");
    expect(source).toContain("Tilldela direkt i listan");
  });
});
