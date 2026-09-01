import { describe, expect, it } from "vitest";
import {
  canFinalizeWorkOrderExecution,
  canMutateWorkOrderExecution,
  isWorkOrderExecutionLocked,
} from "./work-order-execution-policy";

describe("work-order execution policy", () => {
  it.each(["completed", "invoiced", "cancelled"])("locks %s", (status) => {
    expect(isWorkOrderExecutionLocked(status)).toBe(true);
    expect(canMutateWorkOrderExecution(status, true)).toBe(false);
  });

  it.each(["new", "planned", "in_progress", "waiting_material", "blocked"])("keeps %s operationally writable", (status) => {
    expect(isWorkOrderExecutionLocked(status)).toBe(false);
    expect(canMutateWorkOrderExecution(status, true)).toBe(true);
  });

  it("allows finalization only from in_progress and never for a viewer", () => {
    expect(canFinalizeWorkOrderExecution("in_progress")).toBe(true);
    expect(canFinalizeWorkOrderExecution("planned")).toBe(false);
    expect(canMutateWorkOrderExecution("in_progress", false)).toBe(false);
  });
});
