import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  findAccessibleWorkOrderMock,
  listTimeEntriesMock,
  listMaterialEntriesMock,
  upsertTimeEntryMock,
  upsertMaterialEntryMock,
  writeAuditLogMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  findAccessibleWorkOrderMock: vi.fn(),
  listTimeEntriesMock: vi.fn(),
  listMaterialEntriesMock: vi.fn(),
  upsertTimeEntryMock: vi.fn(),
  upsertMaterialEntryMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageWorkOrderFinance: (role: string) => ["owner", "admin", "manager"].includes(role),
  requireCompanyUser: (user: { company_id: string | null; role: string } | null) => {
    if (!user?.company_id) return null;
    if (!["owner", "admin", "manager", "technician", "viewer"].includes(user.role)) return null;
    return user;
  },
}));

vi.mock("@/lib/assigned-work-access", () => ({
  findAccessibleWorkOrder: findAccessibleWorkOrderMock,
  notFoundWorkOrder: () => Response.json({ error: "Arbetsordern hittades inte" }, { status: 404 }),
}));

vi.mock("@/lib/work-order-ops-storage", () => ({
  listTimeEntries: listTimeEntriesMock,
  listMaterialEntries: listMaterialEntriesMock,
  upsertTimeEntry: upsertTimeEntryMock,
  upsertMaterialEntry: upsertMaterialEntryMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

const tx = { workOrderTimeEntry: {}, workOrderMaterialEntry: {}, auditLog: {} };
vi.mock("@/lib/db", () => ({
  default: { $transaction: transactionMock },
}));

import { POST } from "./route";

function request(body: Record<string, unknown> | string) {
  return new Request("https://www.revalta.se/api/work-orders/work-order-1/attestation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "work-order-1" }) };

function managerUser() {
  return {
    id: "manager-1",
    email: "manager@example.com",
    name: "Manager",
    role: "manager",
    company_id: "company-1",
  };
}

function timeEntry(overrides: Record<string, unknown> = {}) {
  return {
    entryId: "time-1",
    workOrderId: "work-order-1",
    userId: "tech-1",
    userName: "Tekniker",
    userEmail: "tech@example.com",
    kind: "work",
    action: "manual",
    startedAt: "2026-09-14T08:00:00.000Z",
    endedAt: "2026-09-14T09:00:00.000Z",
    minutes: 60,
    billable: true,
    note: "Byte av pump",
    status: "submitted",
    actorId: "tech-1",
    createdAt: "2026-09-14T09:00:00.000Z",
    source: "table",
    ...overrides,
  };
}

function materialEntry(overrides: Record<string, unknown> = {}) {
  return {
    entryId: "material-1",
    workOrderId: "work-order-1",
    articleNumber: "P-12",
    name: "Packning",
    quantity: 2,
    unit: "st",
    unitPrice: 45,
    total: 90,
    supplier: "VVS-grossisten",
    stockStatus: "used",
    billable: true,
    note: null,
    status: "submitted",
    createdById: "tech-1",
    createdByName: "Tekniker",
    createdByEmail: "tech@example.com",
    actorId: "tech-1",
    createdAt: "2026-09-14T09:05:00.000Z",
    source: "table",
    ...overrides,
  };
}

describe("POST /api/work-orders/[id]/attestation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(managerUser());
    findAccessibleWorkOrderMock.mockResolvedValue({ id: "work-order-1", assigned_to_id: "tech-1", title: "Byte av pump" });
    listTimeEntriesMock.mockResolvedValue([timeEntry()]);
    listMaterialEntriesMock.mockResolvedValue([materialEntry()]);
    upsertTimeEntryMock.mockImplementation(async (_companyId: string, payload: unknown) => payload);
    upsertMaterialEntryMock.mockImplementation(async (_companyId: string, payload: unknown) => payload);
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("denies technicians from bulk-attesting submitted rows", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      email: "tech@example.com",
      name: "Tekniker",
      role: "technician",
      company_id: "company-1",
    });

    const response = await POST(request({ action: "approveSubmitted" }), params);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att attestera tid och material");
    expect(findAccessibleWorkOrderMock).not.toHaveBeenCalled();
    expect(listTimeEntriesMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects residents before looking up submitted rows", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await POST(request({ action: "approveSubmitted" }), params);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(findAccessibleWorkOrderMock).not.toHaveBeenCalled();
    expect(listTimeEntriesMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("hides work orders outside the manager's access scope", async () => {
    findAccessibleWorkOrderMock.mockResolvedValue(null);
    const response = await POST(request({ action: "approveSubmitted" }), params);
    expect(response.status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects unknown actions before opening a write transaction", async () => {
    const response = await POST(request({ action: "approve" }), params);
    expect(response.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before opening a write transaction", async () => {
    const response = await POST(request("{"), params);
    expect(response.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("approves every modern submitted time and material row in one transaction", async () => {
    listTimeEntriesMock.mockResolvedValue([
      timeEntry(),
      timeEntry({ entryId: "time-2", status: "approved" }),
      timeEntry({ entryId: "time-legacy", source: "legacy" }),
    ]);
    listMaterialEntriesMock.mockResolvedValue([
      materialEntry(),
      materialEntry({ entryId: "material-legacy", source: "legacy" }),
    ]);

    const response = await POST(request({ action: "approveSubmitted" }), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(upsertTimeEntryMock).toHaveBeenCalledTimes(1);
    expect(upsertMaterialEntryMock).toHaveBeenCalledTimes(1);
    expect(upsertTimeEntryMock).toHaveBeenCalledWith("company-1", expect.objectContaining({
      entryId: "time-1",
      action: "approve",
      status: "approved",
      actorId: "manager-1",
      note: "Byte av pump",
    }), tx);
    expect(upsertMaterialEntryMock).toHaveBeenCalledWith("company-1", expect.objectContaining({
      entryId: "material-1",
      status: "approved",
      actorId: "manager-1",
      name: "Packning",
    }), tx);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "manager-1", company_id: "company-1" }),
      expect.objectContaining({
        entityType: "work_order",
        entityId: "work-order-1",
        action: "work_order.attestation_approve_submitted",
        metadata: expect.objectContaining({
          timeCount: 1,
          materialCount: 1,
          timeEntryIds: ["time-1"],
          materialEntryIds: ["material-1"],
          status: "approved",
        }),
      }),
      tx,
    );
    expect(JSON.stringify(writeAuditLogMock.mock.calls[0]?.[1])).not.toMatch(/tech@example.com|VVS-grossisten/);
    expect(body).toEqual({
      action: "approveSubmitted",
      status: "approved",
      time: { count: 1, ids: ["time-1"] },
      material: { count: 1, ids: ["material-1"] },
    });
  });

  it("rejects every modern submitted row without touching already attested ones", async () => {
    const response = await POST(request({ action: "rejectSubmitted" }), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(upsertTimeEntryMock).toHaveBeenCalledWith("company-1", expect.objectContaining({
      entryId: "time-1",
      action: "reject",
      status: "rejected",
      actorId: "manager-1",
    }), tx);
    expect(upsertMaterialEntryMock).toHaveBeenCalledWith("company-1", expect.objectContaining({
      entryId: "material-1",
      status: "rejected",
    }), tx);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "manager-1" }),
      expect.objectContaining({ action: "work_order.attestation_reject_submitted" }),
      tx,
    );
    expect(body.status).toBe("rejected");
  });

  it("returns 409 when only legacy submitted rows remain", async () => {
    listTimeEntriesMock.mockResolvedValue([timeEntry({ source: "legacy" })]);
    listMaterialEntriesMock.mockResolvedValue([]);

    const response = await POST(request({ action: "approveSubmitted" }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 409 when nothing is submitted", async () => {
    listTimeEntriesMock.mockResolvedValue([timeEntry({ status: "approved" })]);
    listMaterialEntriesMock.mockResolvedValue([materialEntry({ status: "rejected" })]);

    const response = await POST(request({ action: "approveSubmitted" }), params);
    expect(response.status).toBe(409);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rolls back the bulk write when audit fails", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    await expect(POST(request({ action: "approveSubmitted" }), params)).rejects.toThrow("audit unavailable");
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(upsertTimeEntryMock).toHaveBeenCalledTimes(1);
  });
});

describe("work-order attestation Tenant B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(managerUser());
    findAccessibleWorkOrderMock.mockResolvedValue(null);
  });

  it("returns tenant-safe 404 when Tenant A attests a Tenant B work-order id", async () => {
    const response = await POST(
      request({ action: "approveSubmitted" }),
      { params: Promise.resolve({ id: "wo-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Arbetsordern hittades inte");
    expect(findAccessibleWorkOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: "company-1" }),
      "wo-tenant-b",
      expect.anything(),
    );
    expect(listTimeEntriesMock).not.toHaveBeenCalled();
    expect(listMaterialEntriesMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
