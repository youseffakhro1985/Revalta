import { describe, expect, it, vi } from "vitest";
import { syncWorkOrderToTicket, ticketStatusForWorkOrder } from "./work-order-ticket-sync";

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

describe("syncWorkOrderToTicket", () => {
  it("updates ticket status without returning unmigrated Ticket scalars", async () => {
    const update = vi.fn().mockResolvedValue({ id: "ticket-1" });
    const create = vi.fn().mockResolvedValue({ id: "audit-1" });
    const tx = {
      ticket: {
        findFirst: vi.fn().mockResolvedValue({ id: "ticket-1", status: "received", assigned_to_id: "user-1" }),
        update,
      },
      auditLog: { create },
    };

    const result = await syncWorkOrderToTicket(tx as never, {
      companyId: "company-1",
      ticketId: "ticket-1",
      workOrderId: "work-order-1",
      status: "in_progress",
      assignedToId: "user-1",
      actorUserId: "user-1",
      statusReason: null,
    });

    expect(result).toEqual({ ticketId: "ticket-1", changed: true, statusChanged: true, status: "in_progress" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { status: "in_progress", assigned_to_id: "user-1" },
      select: { id: true },
    });
  });

  it("reports an assignee-only sync as changed but not a status change", async () => {
    const update = vi.fn().mockResolvedValue({ id: "ticket-1" });
    const create = vi.fn().mockResolvedValue({ id: "audit-1" });
    const tx = {
      ticket: {
        findFirst: vi.fn().mockResolvedValue({ id: "ticket-1", status: "received", assigned_to_id: "user-1" }),
        update,
      },
      auditLog: { create },
    };

    const result = await syncWorkOrderToTicket(tx as never, {
      companyId: "company-1",
      ticketId: "ticket-1",
      workOrderId: "work-order-1",
      status: "planned",
      assignedToId: "user-2",
      actorUserId: "user-1",
      statusReason: null,
    });

    expect(result).toEqual({ ticketId: "ticket-1", changed: true, statusChanged: false, status: "received" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { status: "received", assigned_to_id: "user-2" },
      select: { id: true },
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("reports no change when status and assignee already match", async () => {
    const update = vi.fn();
    const tx = {
      ticket: {
        findFirst: vi.fn().mockResolvedValue({ id: "ticket-1", status: "received", assigned_to_id: "user-1" }),
        update,
      },
      auditLog: { create: vi.fn() },
    };

    const result = await syncWorkOrderToTicket(tx as never, {
      companyId: "company-1",
      ticketId: "ticket-1",
      workOrderId: "work-order-1",
      status: "planned",
      assignedToId: "user-1",
      actorUserId: "user-1",
      statusReason: null,
    });

    expect(result).toEqual({ ticketId: "ticket-1", changed: false, statusChanged: false, status: "received" });
    expect(update).not.toHaveBeenCalled();
  });
});

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
