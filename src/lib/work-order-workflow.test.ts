import { describe, expect, it } from "vitest";
import {
  canTransitionWorkOrder,
  getAllowedWorkOrderTransitions,
  normalizeWorkOrderStatus,
} from "@/lib/work-order-workflow";

describe("work-order-workflow transitions", () => {
  it("normalizes unknown status to planned", () => {
    expect(normalizeWorkOrderStatus("nope")).toBe("planned");
  });

  it("allows planned to in_progress and blocks planned to completed", () => {
    expect(canTransitionWorkOrder("planned", "in_progress")).toBe(true);
    expect(canTransitionWorkOrder("planned", "completed")).toBe(false);
  });

  it("includes current status in allowed transitions", () => {
    expect(getAllowedWorkOrderTransitions("new")).toContain("new");
    expect(getAllowedWorkOrderTransitions("new")).toContain("planned");
  });
});
