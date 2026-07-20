import { describe, expect, it } from "vitest";
import { ticketStatusForWorkOrder } from "./work-order-ticket-sync";

describe("ticketStatusForWorkOrder", () => {
  it.each([
    ["new", "received"],
    ["planned", "received"],
    ["in_progress", "in_progress"],
    ["waiting_material", "waiting"],
    ["blocked", "waiting"],
    ["completed", "completed"],
    ["invoiced", "closed"],
    ["cancelled", "closed"],
  ] as const)("mappar %s till %s", (workOrderStatus, ticketStatus) => {
    expect(ticketStatusForWorkOrder(workOrderStatus)).toBe(ticketStatus);
  });
});
