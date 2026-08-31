import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, workOrderFindFirstMock, workOrderUpdateManyMock, writeAuditLogMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  workOrderUpdateManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock, updateMany: workOrderUpdateManyMock },
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { DELETE } from "./route";

const params = Promise.resolve({ id: "wo-1" });

describe("DELETE /api/work-orders/[id] authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workOrderUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("denies an assigned technician after scoped lookup but before deletion", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", title: "Byt pump", status: "planned", assigned_to_id: "tech-1" });

    const response = await DELETE(new Request("http://localhost/api/work-orders/wo-1", { method: "DELETE" }), { params });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/ta bort arbetsordrar/i);
    expect(workOrderFindFirstMock).toHaveBeenCalledWith({
      where: { id: "wo-1", company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
      select: { id: true, title: true, status: true, assigned_to_id: true },
    });
    expect(workOrderUpdateManyMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("conceals an unassigned work order from a technician", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", title: "Byt pump", status: "planned", assigned_to_id: "tech-2" });

    const response = await DELETE(new Request("http://localhost/api/work-orders/wo-1", { method: "DELETE" }), { params });

    expect(response.status).toBe(404);
    expect(workOrderUpdateManyMock).not.toHaveBeenCalled();
  });

  it("allows a manager to soft-delete a company-scoped work order", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", title: "Byt pump", status: "planned", assigned_to_id: "tech-1" });

    const response = await DELETE(new Request("http://localhost/api/work-orders/wo-1", { method: "DELETE" }), { params });

    expect(response.status).toBe(200);
    expect(workOrderUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "wo-1", company_id: "company-1", deleted_at: null },
      data: { deleted_at: expect.any(Date) },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entityType: "work_order",
      entityId: "wo-1",
      action: "work_order.deleted",
    }));
  });
});
