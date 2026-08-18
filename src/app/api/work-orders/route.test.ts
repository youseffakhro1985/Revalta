import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  workOrderFindManyMock,
  queryRawMock,
  userFindManyMock,
  notDeletedFilterMock,
  sqlSoftDeleteGuardMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
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

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

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

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function request(url = "https://www.revalta.se/api/work-orders", init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("x-request-id", requestId);
  return new Request(url, { ...init, headers });
}

describe("work-orders GET role scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    notDeletedFilterMock.mockResolvedValue({ deleted_at: null });
    sqlSoftDeleteGuardMock.mockResolvedValue("");
    workOrderFindManyMock.mockResolvedValue([]);
    queryRawMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([{ id: "tech-1", name: "Tekniker", email: "t@example.com" }]);
  });

  it("scopes technicians to assigned work and omits assignees", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
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
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "work-order list completed",
      expect.objectContaining({
        event: "work_orders.list.completed",
        userId: "tech-1",
        companyId: "company-1",
        scopedToAssigned: true,
      }),
    );
  });

  it("lets managers see all work orders and assignable users", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

    const response = await GET(request());
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

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(queryRawMock.mock.calls[0][0].values).toContain("work-order-1");
  });

  it("excludes terminal work orders from planning reads", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

    const response = await GET(request("https://www.revalta.se/api/work-orders?view=planning"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(workOrderFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { notIn: ["completed", "invoiced", "cancelled"] },
      }),
    }));
    expect(body.resultScope).toBe("active");
  });

  it("returns a correlated safe 401 without querying work orders", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: "Obehörig",
      errorCode: "UNAUTHORIZED",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(workOrderFindManyMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "work-order request rejected",
      expect.objectContaining({ event: "work_orders.list.unauthorized" }),
    );
  });

  it("returns a safe correlated 500 when the authenticated lookup fails", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("postgres://user:super-secret@db.internal/revalta"));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "work-order list failed",
      expect.any(Error),
      expect.objectContaining({ event: "work_orders.list.failed" }),
    );
  });
});

describe("work-orders POST assignment authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
  });

  it("prevents a technician from assigning newly created work to another user with a stable error contract", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await POST(request("https://www.revalta.se/api/work-orders", {
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
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "work-order request rejected",
      expect.objectContaining({
        event: "work_orders.create.assignment_forbidden",
        userId: "tech-1",
        companyId: "company-1",
      }),
    );
  });

  it("returns a correlated safe 500 when authentication fails unexpectedly", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("session-secret-that-must-not-leak"));

    const response = await POST(request("https://www.revalta.se/api/work-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("session-secret");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "work-order create failed",
      expect.any(Error),
      expect.objectContaining({ event: "work_orders.create.failed" }),
    );
  });
});
