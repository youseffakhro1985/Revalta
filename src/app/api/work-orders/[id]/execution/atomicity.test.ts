import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  queryRawMock,
  txExecuteRawMock,
  txQueryRawMock,
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
  txExecuteRawMock: vi.fn(),
  txQueryRawMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  completeLifecycleMock: vi.fn(),
  getModernTimeEntryMock: vi.fn(),
  getModernMaterialEntryMock: vi.fn(),
  upsertTimeEntryMock: vi.fn(),
  upsertMaterialEntryMock: vi.fn(),
}));

const tx = {
  $executeRaw: txExecuteRawMock,
  $queryRaw: txQueryRawMock,
};

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageTickets: () => true,
  canViewFinanceData: () => true,
}));
vi.mock("@/lib/assigned-work-access", () => ({
  isAssignedWorkAccessible: () => true,
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
    $transaction: transactionMock,
  },
}));

import { POST } from "./route";

const params = { params: Promise.resolve({ id: "wo-1" }) };

function request(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/work-orders/wo-1/execution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sqlText(query: unknown) {
  return Array.isArray((query as { strings?: readonly string[] }).strings)
    ? (query as { strings: readonly string[] }).strings.join(" ")
    : String(query);
}

describe("work-order execution atomic persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", email: "manager@example.com", name: "Manager", role: "manager", company_id: "company-1" });
    workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", title: "Test", status: "in_progress", assigned_to_id: "manager-1" });
    txExecuteRawMock.mockResolvedValue(1);
    txQueryRawMock.mockResolvedValue([]);
    writeAuditLogMock.mockResolvedValue(undefined);
    completeLifecycleMock.mockResolvedValue({ ticketSync: null, componentSync: null });
    getModernTimeEntryMock.mockResolvedValue(null);
    getModernMaterialEntryMock.mockResolvedValue(null);
    upsertTimeEntryMock.mockResolvedValue({});
    upsertMaterialEntryMock.mockResolvedValue({});
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("creates checklist item and audit in one transaction", async () => {
    const response = await POST(request({ action: "checklist.create", title: "Kontrollera pump" }), params);

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txExecuteRawMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: "company-1" }),
      expect.objectContaining({ action: "work_order.checklist_created" }),
      tx,
    );
  });

  it("propagates checklist audit failure through the write transaction", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    await expect(POST(request({ action: "checklist.create", title: "Kontrollera pump" }), params))
      .rejects.toThrow("audit unavailable");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txExecuteRawMock).toHaveBeenCalledTimes(1);
  });

  it("does not audit a checklist completion when no tenant-scoped row changed", async () => {
    txExecuteRawMock.mockResolvedValue(0);

    const response = await POST(request({ action: "checklist.complete", itemId: "missing" }), params);

    expect(response.status).toBe(404);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("creates an execution entry and audit in one transaction", async () => {
    const response = await POST(request({ action: "entry.create", entryType: "time", description: "Felsökning", quantity: 1, unitCost: 0, minutes: 30 }), params);

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txExecuteRawMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: "company-1" }),
      expect.objectContaining({ action: "work_order.time_registered" }),
      tx,
    );
  });

  it("keeps completion lifecycle and completion audit in the same transaction", async () => {
    queryRawMock.mockResolvedValue([{ required_incomplete: 0, before_photos: 1, after_photos: 1 }]);
    txQueryRawMock.mockImplementation(async (query: unknown) => {
      const text = sqlText(query);
      if (text.includes("total_cost")) return [{ total_cost: 225 }];
      if (text.includes("completion_due_at")) return [{ completion_due_at: new Date(Date.now() + 60_000) }];
      if (text.includes("WorkOrderExecutionEntry")) return [];
      return [];
    });

    const response = await POST(request({ action: "completion.finalize" }), params);

    expect(response.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(completeLifecycleMock).toHaveBeenCalledWith(tx, expect.objectContaining({ companyId: "company-1", workOrderId: "wo-1", legacySlaStatus: "met" }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: "company-1" }),
      expect.objectContaining({ action: "work_order.completed" }),
      tx,
    );
  });

  it("propagates completion audit failure so the completion transaction rolls back", async () => {
    queryRawMock.mockResolvedValue([{ required_incomplete: 0, before_photos: 1, after_photos: 1 }]);
    txQueryRawMock.mockImplementation(async (query: unknown) => {
      const text = sqlText(query);
      if (text.includes("total_cost")) return [{ total_cost: 225 }];
      if (text.includes("completion_due_at")) return [{ completion_due_at: null }];
      if (text.includes("WorkOrderExecutionEntry")) return [];
      return [];
    });
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    await expect(POST(request({ action: "completion.finalize" }), params)).rejects.toThrow("audit unavailable");

    expect(completeLifecycleMock).toHaveBeenCalledTimes(1);
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed JSON before opening a write transaction", async () => {
    const malformed = new Request("https://www.revalta.se/api/work-orders/wo-1/execution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(malformed, params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Ogiltigt innehåll" });
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
