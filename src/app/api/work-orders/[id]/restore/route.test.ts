import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  workOrderUpdateManyMock,
  ticketFindFirstMock,
  writeAuditLogMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  workOrderUpdateManyMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/db", () => {
  const dbMock = {
    workOrder: {
      findFirst: workOrderFindFirstMock,
      updateMany: workOrderUpdateManyMock,
    },
    ticket: {
      findFirst: ticketFindFirstMock,
    },
    $transaction: transactionMock,
  };
  transactionMock.mockImplementation((callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return { default: dbMock };
});

import { POST } from "./route";

const params = Promise.resolve({ id: "wo-1" });

describe("work-orders/[id]/restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    workOrderUpdateManyMock.mockResolvedValue({ count: 1 });
  });

  it("restores a soft-deleted work order", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    workOrderFindFirstMock
      .mockResolvedValueOnce({
        id: "wo-1",
        title: "Åtgärd",
        status: "planned",
        ticket_id: "ticket-1",
        property: { deleted_at: null },
      })
      .mockResolvedValueOnce(null);
    ticketFindFirstMock.mockResolvedValue({ id: "ticket-1", deleted_at: null });

    const response = await POST(new Request("http://localhost/api/work-orders/wo-1/restore", { method: "POST" }), { params });
    expect(response.status).toBe(200);
    expect(workOrderUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "wo-1", company_id: "company-1", deleted_at: { not: null } },
      data: { deleted_at: null },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "work_order.restored" }),
      expect.anything(),
    );
  });

  it("returns 409 when another work order owns the ticket link", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    workOrderFindFirstMock
      .mockResolvedValueOnce({
        id: "wo-1",
        title: "Åtgärd",
        status: "planned",
        ticket_id: "ticket-1",
        property: { deleted_at: null },
      })
      .mockResolvedValueOnce({ id: "wo-2", deleted_at: null });

    const response = await POST(new Request("http://localhost/api/work-orders/wo-1/restore", { method: "POST" }), { params });
    expect(response.status).toBe(409);
    expect(workOrderUpdateManyMock).not.toHaveBeenCalled();
  });

  it("does not report success when the audit log write fails inside the transaction", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    workOrderFindFirstMock
      .mockResolvedValueOnce({
        id: "wo-1",
        title: "Åtgärd",
        status: "planned",
        ticket_id: null,
        property: { deleted_at: null },
      });
    writeAuditLogMock.mockRejectedValue(new Error("audit db unavailable"));

    const response = await POST(new Request("http://localhost/api/work-orders/wo-1/restore", { method: "POST" }), { params });

    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
