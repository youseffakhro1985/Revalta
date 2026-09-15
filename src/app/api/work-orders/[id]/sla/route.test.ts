import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  auditLogFindManyMock,
  transactionMock,
  getEnterpriseMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  auditLogFindManyMock: vi.fn(),
  transactionMock: vi.fn(),
  getEnterpriseMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/work-order-enterprise-core", () => ({
  getWorkOrderEnterpriseState: getEnterpriseMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

vi.mock("@prisma/client", () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    TransactionIsolationLevel: { Serializable: "Serializable" },
  },
}));

const tx = {
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  auditLog: { create: vi.fn() },
};

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock },
    auditLog: { findMany: auditLogFindManyMock },
    $transaction: transactionMock,
  },
}));

import { PATCH } from "./route";

const params = { params: Promise.resolve({ id: "wo-1" }) };
const existingUpdatedAt = new Date("2026-09-15T09:00:00.000Z");
const responseDue = new Date("2026-09-16T08:00:00.000Z");
const resolutionDue = new Date("2026-09-18T08:00:00.000Z");
const nextResolutionDue = new Date("2026-09-19T08:00:00.000Z");

function ownerUser() {
  return {
    id: "owner-1",
    email: "owner@example.com",
    name: "Owner",
    company_id: "company-1",
    role: "owner",
  };
}

function workOrderRow() {
  return {
    id: "wo-1",
    status: "in_progress",
    priority: "normal",
    created_at: new Date("2026-09-15T08:00:00.000Z"),
    completed_at: null,
    assigned_to_id: "tech-1",
    updated_at: existingUpdatedAt,
  };
}

function enterpriseState(overrides: Record<string, unknown> = {}) {
  return {
    sla_response_due_at: responseDue,
    sla_resolution_due_at: resolutionDue,
    responded_at: null,
    closed_at: null,
    paused_at: null,
    pause_reason: null,
    ...overrides,
  };
}

function patchRequest(body: Record<string, unknown> = {}) {
  return new Request("https://www.revalta.se/api/work-orders/wo-1/sla", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      responseDueAt: responseDue.toISOString(),
      resolutionDueAt: nextResolutionDue.toISOString(),
      reason: "Hyresgästen är bortrest till nästa vecka",
      editToken: "lock-token",
      version: existingUpdatedAt.toISOString(),
      ...body,
    }),
  });
}

describe("work-order SLA PATCH lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(ownerUser());
    workOrderFindFirstMock.mockResolvedValue(workOrderRow());
    getEnterpriseMock.mockResolvedValue(enterpriseState());
    writeAuditLogMock.mockResolvedValue(undefined);
    auditLogFindManyMock.mockResolvedValue([]);
    tx.$executeRaw.mockResolvedValue(1);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    (tx.$queryRaw as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ updated_at: existingUpdatedAt }])
      .mockResolvedValueOnce([{ token_hash: "held" }]);
  });

  it("rejects PATCH without an edit lock before opening a transaction", async () => {
    const response = await PATCH(new Request("https://www.revalta.se/api/work-orders/wo-1/sla", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        responseDueAt: responseDue.toISOString(),
        resolutionDueAt: nextResolutionDue.toISOString(),
        reason: "Hyresgästen är bortrest till nästa vecka",
      }),
    }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("lock_required");
    expect(body.error).toBe("Ett aktivt redigeringslås och en dokumentversion krävs");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects PATCH with an invalid lock version before opening a transaction", async () => {
    const response = await PATCH(patchRequest({ version: "not-a-date" }), params);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("invalid_version");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("keeps lock assert, SLA update and audit in the same transaction", async () => {
    const response = await PATCH(patchRequest(), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.version).toBe(existingUpdatedAt.toISOString());
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "owner-1", company_id: "company-1" }),
      expect.objectContaining({
        entityType: "work_order",
        entityId: "wo-1",
        action: "work_order.sla_deadlines_updated",
      }),
      tx,
    );
  });

  it("rejects PATCH when the held lock version no longer matches inside the transaction", async () => {
    (tx.$queryRaw as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockResolvedValueOnce([{ updated_at: new Date("2026-09-15T10:00:00.000Z") }])
      .mockResolvedValueOnce([{ token_hash: "held" }]);

    const response = await PATCH(patchRequest(), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("version_conflict");
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects PATCH when the edit lock has been lost", async () => {
    (tx.$queryRaw as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockResolvedValueOnce([{ updated_at: existingUpdatedAt }])
      .mockResolvedValueOnce([]);

    const response = await PATCH(patchRequest(), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("lock_lost");
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
