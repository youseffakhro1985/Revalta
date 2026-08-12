import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindManyMock,
  queryRawMock,
  userFindManyMock,
  notDeletedFilterMock,
  sqlSoftDeleteGuardMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindManyMock: vi.fn(),
  queryRawMock: vi.fn(),
  userFindManyMock: vi.fn(),
  notDeletedFilterMock: vi.fn(),
  sqlSoftDeleteGuardMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/schema-readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema-readiness")>()),
  notDeletedFilter: notDeletedFilterMock,
}));

vi.mock("@/lib/soft-delete-compat", () => ({
  sqlSoftDeleteGuard: sqlSoftDeleteGuardMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findMany: workOrderFindManyMock },
    user: { findMany: userFindManyMock },
    $queryRaw: queryRawMock,
  },
}));

vi.mock("@/lib/work-order-sla", () => ({
  evaluateWorkOrderSla: () => ({
    phase: "resolution",
    risk: "normal",
    label: "Inom SLA",
    dueAt: null,
    remainingMinutes: 60,
    overdueMinutes: null,
    pauseReason: null,
    response: { dueAt: null, achievedAt: null, breached: false, varianceMinutes: null },
    resolution: { dueAt: null, achievedAt: null, breached: false, varianceMinutes: null },
  }),
}));

import { GET, POST } from "./route";

describe("work-orders GET role scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notDeletedFilterMock.mockResolvedValue({ deleted_at: null });
    sqlSoftDeleteGuardMock.mockResolvedValue("");
    workOrderFindManyMock.mockResolvedValue([]);
    queryRawMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([{ id: "tech-1", name: "Tekniker", email: "t@example.com" }]);
  });

  it("scopes technicians to assigned work and omits assignees", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await GET(new Request("https://www.revalta.se/api/work-orders"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(workOrderFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-1",
        assigned_to_id: "tech-1",
      }),
    }));
    expect(userFindManyMock).not.toHaveBeenCalled();
    expect(body.permissions).toEqual({
      canManage: true,
      canAssign: false,
      canManageFinance: false,
      canViewFinance: false,
      scopedToAssigned: true,
    });
    expect(body.assignees).toEqual([]);
  });

  it("lets managers see all work orders and assignable users", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

    const response = await GET(new Request("https://www.revalta.se/api/work-orders"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(workOrderFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-1",
      }),
    }));
    expect(workOrderFindManyMock.mock.calls[0][0].where.assigned_to_id).toBeUndefined();
    expect(userFindManyMock).toHaveBeenCalled();
    expect(body.permissions).toEqual({
      canManage: true,
      canAssign: true,
      canManageFinance: true,
      canViewFinance: true,
      scopedToAssigned: false,
    });
    expect(body.assignees).toHaveLength(1);
  });

  it("limits enterprise enrichment to work orders in the returned list", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    workOrderFindManyMock.mockResolvedValue([{
      id: "work-order-1",
      title: "Kontrollera ventilation",
      status: "planned",
      priority: "normal",
      estimated_cost: null,
      completed_at: null,
      scheduled_start: null,
      created_at: new Date("2026-08-12T00:00:00Z"),
      property: { id: "property-1", name: "Fastigheten", address: "Storgatan 1", city: "Stockholm" },
      unit: null,
      ticket: null,
      assigned_to: null,
      projects: [],
    }]);

    const response = await GET(new Request("https://www.revalta.se/api/work-orders"));

    expect(response.status).toBe(200);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(queryRawMock.mock.calls[0][0].values).toContain("work-order-1");
  });

  it("excludes terminal work orders from planning reads", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

    const response = await GET(new Request("https://www.revalta.se/api/work-orders?view=planning"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(workOrderFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { notIn: ["completed", "invoiced", "cancelled"] },
      }),
    }));
    expect(body.resultScope).toBe("active");
  });
});

describe("work-orders POST assignment authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prevents a technician from assigning newly created work to another user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await POST(new Request("https://www.revalta.se/api/work-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: "property-1",
        title: "Kontrollera läckage",
        description: "Kontrollera och dokumentera",
        assignedToId: "tech-2",
      }),
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Du saknar behörighet att tilldela arbetsorder till andra",
    });
  });
});
