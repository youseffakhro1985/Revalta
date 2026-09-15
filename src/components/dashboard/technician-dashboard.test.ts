import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("technician Min dag", () => {
  it("shows Swedish work-order status labels instead of raw status keys", () => {
    const source = readFileSync(new URL("./technician-dashboard.tsx", import.meta.url), "utf8");
    expect(source).toContain("WORK_ORDER_STATUS_LABELS");
    expect(source).toContain("normalizeWorkOrderStatus");
    expect(source).not.toContain("{nextOrder.status}");
  });

  it("registers time on the next work order without a complete action", () => {
    const source = readFileSync(new URL("./technician-dashboard.tsx", import.meta.url), "utf8");
    expect(source).toContain("TechnicianNextOrderTimeForm");
    expect(source).not.toContain("completion.finalize");
    expect(source).not.toContain("Slutför");
  });
});
