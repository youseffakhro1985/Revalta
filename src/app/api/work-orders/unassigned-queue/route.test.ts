import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, workOrderFindManyMock, userFindManyMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindManyMock: vi.fn(),
  userFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findMany: workOrderFindManyMock },
    user: { findMany: userFindManyMock },
  },
}));

import { GET } from "./route";

describe("GET /api/work-orders/unassigned-queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workOrderFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([]);
  });

  it("denies technicians from reading the unassigned work-order queue", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att tilldela arbetsordrar");
    expect(workOrderFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing work orders or assignee emails", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(workOrderFindManyMock).not.toHaveBeenCalled();
    expect(userFindManyMock).not.toHaveBeenCalled();
  });

  it("lists unassigned active work orders and assignable staff", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-1", company_id: "company-1", role: "manager" });
    workOrderFindManyMock.mockResolvedValue([{
      id: "wo-1",
      title: "Byte av cirkulationspump",
      status: "planned",
      priority: "urgent",
      work_order_number: "AO-2026-000012",
      created_at: new Date("2026-09-14T08:00:00.000Z"),
      property: { id: "prop-1", name: "Storgatan 12" },
    }]);
    userFindManyMock.mockResolvedValue([
      { id: "tech-1", name: "Tina Tekniker", email: "tina@example.com", role: "technician" },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(workOrderFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        assigned_to_id: null,
        deleted_at: null,
        company_id: "company-1",
        status: { notIn: ["completed", "invoiced", "cancelled"] },
      }),
    }));
    expect(body.workOrders[0]).toEqual(expect.objectContaining({
      id: "wo-1",
      href: "/dashboard/arbetsorder/wo-1",
      workOrderNumber: "AO-2026-000012",
      status: "planned",
      statusLabel: "Planerad",
      priorityLabel: "Akut",
    }));
    expect(body.assignees).toEqual([expect.objectContaining({ id: "tech-1", name: "Tina Tekniker" })]);
    expect(body.selfId).toBe("mgr-1");
    expect(userFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-1",
        status: "active",
        role: { in: ["owner", "admin", "manager", "technician"] },
      }),
    }));
  });
});
