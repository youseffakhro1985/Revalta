import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  workOrderUpdateManyMock,
  ticketFindFirstMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  workOrderUpdateManyMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: {
      findFirst: workOrderFindFirstMock,
      updateMany: workOrderUpdateManyMock,
    },
    ticket: {
      findFirst: ticketFindFirstMock,
    },
  },
}));

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
});
