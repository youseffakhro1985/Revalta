import { beforeEach, describe, expect, it, vi } from "vitest";

const { addStatusEventMock, syncTicketMock, syncComponentMock } = vi.hoisted(() => ({
  addStatusEventMock: vi.fn(),
  syncTicketMock: vi.fn(),
  syncComponentMock: vi.fn(),
}));

vi.mock("@/lib/work-order-enterprise-core", () => ({ addWorkOrderStatusEvent: addStatusEventMock }));
vi.mock("@/lib/work-order-ticket-sync", () => ({ syncWorkOrderToTicket: syncTicketMock }));
vi.mock("@/lib/component-work-order-sync", () => ({ syncCompletedWorkOrderToComponent: syncComponentMock }));

import { completeWorkOrderLifecycle, WorkOrderCompletionConflict } from "./work-order-completion";

function transactionClient(args: { current?: { responded_at: Date | null } | null; updatedCount?: number } = {}) {
  const completedAt = new Date("2026-09-01T10:00:00.000Z");
  const updated = {
    id: "wo-1",
    ticket_id: "ticket-1",
    property_id: "property-1",
    technical_asset_id: "asset-1",
    assigned_to_id: "tech-1",
    work_order_number: "AO-2026-000001",
    work_type: "corrective",
    title: "Laga pump",
    description: "Pumpfel",
    status: "completed",
    priority: "high",
    completed_at: completedAt,
    actual_cost: 1250,
  };
  const findFirst = vi.fn()
    .mockResolvedValueOnce(args.current === undefined ? { responded_at: null } : args.current)
    .mockResolvedValueOnce(updated);
  return {
    completedAt,
    updated,
    tx: {
      workOrder: {
        findFirst,
        updateMany: vi.fn().mockResolvedValue({ count: args.updatedCount ?? 1 }),
      },
    },
  };
}

describe("completeWorkOrderLifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addStatusEventMock.mockResolvedValue(undefined);
    syncTicketMock.mockResolvedValue({ changed: true });
    syncComponentMock.mockResolvedValue({ lifecycleSynced: true });
  });

  it("owns the canonical completed write and all completion side effects", async () => {
    const { tx, completedAt } = transactionClient();
    const result = await completeWorkOrderLifecycle(tx as never, {
      companyId: "company-1",
      workOrderId: "wo-1",
      actorUserId: "manager-1",
      completedAt,
      actualCost: 1250,
      legacySlaStatus: "met",
      statusEventMetadata: { source: "test" },
    });

    expect(tx.workOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "in_progress", company_id: "company-1" }),
      data: expect.objectContaining({ status: "completed", actual_cost: 1250, sla_status: "met" }),
    }));
    expect(addStatusEventMock).toHaveBeenCalledWith(tx, expect.objectContaining({ fromStatus: "in_progress", toStatus: "completed" }));
    expect(syncTicketMock).toHaveBeenCalledWith(tx, expect.objectContaining({ status: "completed", ticketId: "ticket-1" }));
    expect(syncComponentMock).toHaveBeenCalledWith(tx, expect.objectContaining({ technicalAssetId: "asset-1", actualCost: 1250 }));
    expect(result.ticketSync).toEqual({ changed: true });
  });

  it("fails without writes when the current status is not in_progress", async () => {
    const { tx, completedAt } = transactionClient({ current: null });

    await expect(completeWorkOrderLifecycle(tx as never, {
      companyId: "company-1",
      workOrderId: "wo-1",
      actorUserId: "manager-1",
      completedAt,
    })).rejects.toBeInstanceOf(WorkOrderCompletionConflict);

    expect(tx.workOrder.updateMany).not.toHaveBeenCalled();
    expect(addStatusEventMock).not.toHaveBeenCalled();
    expect(syncTicketMock).not.toHaveBeenCalled();
    expect(syncComponentMock).not.toHaveBeenCalled();
  });

  it("rolls back the lifecycle path when a concurrent status change wins", async () => {
    const { tx, completedAt } = transactionClient({ updatedCount: 0 });

    await expect(completeWorkOrderLifecycle(tx as never, {
      companyId: "company-1",
      workOrderId: "wo-1",
      actorUserId: "manager-1",
      completedAt,
    })).rejects.toBeInstanceOf(WorkOrderCompletionConflict);

    expect(addStatusEventMock).not.toHaveBeenCalled();
    expect(syncTicketMock).not.toHaveBeenCalled();
    expect(syncComponentMock).not.toHaveBeenCalled();
  });
});
