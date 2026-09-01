import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  queryRawMock,
  executeRawMock,
  transactionMock,
  writeAuditLogMock,
  completeLifecycleMock,
  getModernTimeEntryMock,
  getModernMaterialEntryMock,
  upsertTimeEntryMock,
  upsertMaterialEntryMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  queryRawMock: vi.fn(),
  executeRawMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  completeLifecycleMock: vi.fn(),
  getModernTimeEntryMock: vi.fn(),
  getModernMaterialEntryMock: vi.fn(),
  upsertTimeEntryMock: vi.fn(),
  upsertMaterialEntryMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageTickets: (role: string) => ["owner", "admin", "manager", "technician"].includes(role),
  canViewFinanceData: (role: string) => ["owner", "admin", "manager", "viewer"].includes(role),
}));
vi.mock("@/lib/assigned-work-access", () => ({
  isAssignedWorkAccessible: (user: { role: string; id: string }, assignedToId: string | null) => user.role !== "technician" || user.id === assignedToId,
  notFoundWorkOrder: () => Response.json({ error: "Arbetsordern hittades inte" }, { status: 404 }),
}));
vi.mock("@/lib/soft-delete-compat", () => ({ sqlSoftDeleteGuard: vi.fn().mockResolvedValue(Prisma.empty) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/work-order-completion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/work-order-completion")>()),
  completeWorkOrderLifecycle: completeLifecycleMock,
}));
vi.mock("@/lib/work-order-ops-storage", () => ({
  getModernTimeEntry: getModernTimeEntryMock,
  getModernMaterialEntry: getModernMaterialEntryMock,
  upsertTimeEntry: upsertTimeEntryMock,
  upsertMaterialEntry: upsertMaterialEntryMock,
}));
vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock },
    $queryRaw: queryRawMock,
    $executeRaw: executeRawMock,
    $transaction: transactionMock,
  },
}));

import { GET, POST } from "./route";

const params = { params: Promise.resolve({ id: "wo-1" }) };

function request(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/work-orders/wo-1/execution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function user(role = "manager") {
  return { id: role === "technician" ? "tech-1" : "user-1", email: "user@example.com", name: "User", role, company_id: "company-1" };
}

function workOrder(status: string) {
  return { id: "wo-1", title: "Test", status, assigned_to_id: status === "assigned_elsewhere" ? "other" : "tech-1" };
}

function sqlText(query: unknown) {
  return Array.isArray((query as { strings?: readonly string[] }).strings)
    ? (query as { strings: readonly string[] }).strings.join(" ")
    : String(query);
}

describe("work-order execution lifecycle boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(user());
    executeRawMock.mockResolvedValue(1);
    writeAuditLogMock.mockResolvedValue(undefined);
    completeLifecycleMock.mockResolvedValue({ ticketSync: null, componentSync: null });
    getModernTimeEntryMock.mockResolvedValue(null);
    getModernMaterialEntryMock.mockResolvedValue(null);
    upsertTimeEntryMock.mockResolvedValue({});
    upsertMaterialEntryMock.mockResolvedValue({});
  });

  it.each(["planned", "new", "waiting_material", "blocked", "completed", "invoiced", "cancelled"])("rejects finalization from %s before writes", async (status) => {
    workOrderFindFirstMock.mockResolvedValue(workOrder(status));

    const response = await POST(request({ action: "completion.finalize" }), params);

    expect(response.status).toBe(409);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(executeRawMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it.each(["completed", "invoiced", "cancelled"])("rejects checklist and execution-entry writes after %s", async (status) => {
    workOrderFindFirstMock.mockResolvedValue(workOrder(status));
    for (const action of ["checklist.create", "checklist.complete", "entry.create"]) {
      const response = await POST(request({ action, title: "Kontroll", itemId: "item-1", entryType: "time", description: "Arbete" }), params);
      expect(response.status).toBe(409);
    }
    expect(executeRawMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects the legacy SLA mutation and directs callers to the canonical route", async () => {
    workOrderFindFirstMock.mockResolvedValue(workOrder("in_progress"));

    const response = await POST(request({ action: "sla.update", slaStatus: "met" }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("canonical_sla_route_required");
    expect(executeRawMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("keeps viewers read-only at the server boundary", async () => {
    getCurrentUserMock.mockResolvedValue(user("viewer"));

    const response = await POST(request({ action: "entry.create", entryType: "time", description: "Arbete" }), params);

    expect(response.status).toBe(403);
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
    expect(executeRawMock).not.toHaveBeenCalled();
  });

  it("redacts technician finance and returns an explicit execution policy contract", async () => {
    getCurrentUserMock.mockResolvedValue(user("technician"));
    workOrderFindFirstMock.mockResolvedValue(workOrder("in_progress"));
    queryRawMock.mockImplementation(async (query: unknown) => {
      const text = sqlText(query);
      if (text.includes("WorkOrderChecklistItem") && text.includes("SELECT \"id\"")) return [];
      if (text.includes("WorkOrderExecutionEntry") && text.includes("ORDER BY \"occurred_at\" DESC")) return [{ id: "entry-1", entry_type: "material", description: "Filter", quantity: 1, unit: "st", unit_cost: 75, total_amount: 75, minutes: null, distance_km: null, supplier: null, occurred_at: new Date(), created_at: new Date() }];
      if (text.includes("COALESCE(SUM(\"minutes\")")) return [{ total_minutes: 30, material_cost: 75, travel_cost: 0, external_cost: 0, total_cost: 75 }];
      if (text.includes("response_due_at")) return [{ response_due_at: null, completion_due_at: null, responded_at: null, sla_status: "not_set" }];
      if (text.includes("required_incomplete")) return [{ required_incomplete: 0, before_photos: 1, after_photos: 1 }];
      return [];
    });

    const response = await GET(new Request("https://www.revalta.se/api/work-orders/wo-1/execution"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canManage).toBe(true);
    expect(body.canViewFinance).toBe(false);
    expect(body.summary).toEqual({ total_minutes: 30, material_cost: null, travel_cost: null, external_cost: null, total_cost: null });
    expect(body.entries[0].unit_cost).toBeNull();
    expect(body.entries[0].total_amount).toBeNull();
    expect(body.completion).toEqual({ status: "in_progress", required_incomplete: 0, before_photo_count: 1, after_photo_count: 1 });
  });

  it("finalizes in-progress work through the canonical completion helper inside one transaction", async () => {
    workOrderFindFirstMock.mockResolvedValue(workOrder("in_progress"));
    queryRawMock.mockResolvedValue([{ required_incomplete: 0, before_photos: 1, after_photos: 1 }]);
    const tx = {
      $queryRaw: vi.fn().mockImplementation(async (query: unknown) => {
        const text = sqlText(query);
        if (text.includes("total_cost")) return [{ total_cost: 225 }];
        if (text.includes("completion_due_at")) return [{ completion_due_at: new Date("2026-09-02T10:00:00.000Z") }];
        if (text.includes("WorkOrderExecutionEntry")) return [];
        return [];
      }),
    };
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));

    const response = await POST(request({ action: "completion.finalize" }), params);

    expect(response.status).toBe(200);
    expect(completeLifecycleMock).toHaveBeenCalledWith(tx, expect.objectContaining({
      companyId: "company-1",
      workOrderId: "wo-1",
      actualCost: 225,
      legacySlaStatus: "met",
    }));
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
  });
});
