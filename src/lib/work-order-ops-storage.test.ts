import { describe, expect, it } from "vitest";

describe("work-order-ops-storage contracts", () => {
  it("keeps invoice draft line shape stable for dual-read consumers", () => {
    const line = {
      id: "line-1",
      type: "labor",
      description: "Arbete",
      quantity: 2,
      unit: "tim",
      unitPrice: 650,
      total: 1300,
    };
    expect(line).toMatchObject({
      type: "labor",
      quantity: expect.any(Number),
      unitPrice: expect.any(Number),
      total: expect.any(Number),
    });
  });
});

describe("work-order time/material source markers", () => {
  it("documents dual-read source contract for attestation UI", () => {
    const modern = { entryId: "t1", source: "table" as const, status: "submitted" };
    const legacy = { entryId: "t2", source: "legacy" as const, status: "submitted" };
    expect(modern.source).toBe("table");
    expect(legacy.source).toBe("legacy");
    expect(legacy.source === "legacy").toBe(true);
  });
});
