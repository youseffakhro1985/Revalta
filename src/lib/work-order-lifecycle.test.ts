import { describe, expect, it } from "vitest";
import {
  allowedWorkOrderTransitions,
  canTransitionWorkOrder,
  deriveWorkOrderStatus,
  isTerminalWorkOrderStatus,
  isWorkOrderStatus,
} from "./work-order-lifecycle";

describe("work order lifecycle", () => {
  it("accepts every supported status and rejects unknown values", () => {
    expect(isWorkOrderStatus("inspection")).toBe(true);
    expect(isWorkOrderStatus("completed")).toBe(true);
    expect(isWorkOrderStatus("deleted")).toBe(false);
    expect(isWorkOrderStatus(null)).toBe(false);
  });

  it("allows the normal operational path", () => {
    expect(canTransitionWorkOrder("new", "planned")).toBe(true);
    expect(canTransitionWorkOrder("planned", "assigned")).toBe(true);
    expect(canTransitionWorkOrder("assigned", "in_progress")).toBe(true);
    expect(canTransitionWorkOrder("in_progress", "inspection")).toBe(true);
    expect(canTransitionWorkOrder("inspection", "completed")).toBe(true);
    expect(canTransitionWorkOrder("completed", "invoiced")).toBe(true);
    expect(canTransitionWorkOrder("invoiced", "closed")).toBe(true);
  });

  it("blocks invalid jumps that bypass required workflow stages", () => {
    expect(canTransitionWorkOrder("new", "closed")).toBe(false);
    expect(canTransitionWorkOrder("assigned", "invoiced")).toBe(false);
    expect(canTransitionWorkOrder("waiting", "completed")).toBe(false);
    expect(canTransitionWorkOrder("closed", "planned")).toBe(false);
  });

  it("allows idempotent updates and controlled reopening", () => {
    expect(canTransitionWorkOrder("in_progress", "in_progress")).toBe(true);
    expect(canTransitionWorkOrder("closed", "in_progress")).toBe(true);
    expect(canTransitionWorkOrder("cancelled", "new")).toBe(true);
  });

  it("automatically marks a new assigned order as assigned", () => {
    expect(deriveWorkOrderStatus({ current: "new", assignedToId: "user-1" })).toBe("assigned");
    expect(deriveWorkOrderStatus({ current: "new", assignedToId: null })).toBe("new");
    expect(deriveWorkOrderStatus({ current: "planned", assignedToId: "user-1" })).toBe("planned");
  });

  it("exposes the valid next states and terminal states", () => {
    expect(allowedWorkOrderTransitions("inspection")).toEqual(["in_progress", "completed"]);
    expect(isTerminalWorkOrderStatus("closed")).toBe(true);
    expect(isTerminalWorkOrderStatus("cancelled")).toBe(true);
    expect(isTerminalWorkOrderStatus("completed")).toBe(false);
  });
});
