import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  findAccessibleWorkOrderMock,
  getModernMaterialEntryMock,
  getMaterialEntryMock,
  listMaterialEntriesMock,
  upsertMaterialEntryMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  findAccessibleWorkOrderMock: vi.fn(),
  getModernMaterialEntryMock: vi.fn(),
  getMaterialEntryMock: vi.fn(),
  listMaterialEntriesMock: vi.fn(),
  upsertMaterialEntryMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageTickets: (role: string) => ["owner", "admin", "manager", "technician"].includes(role),
  canManageWorkOrderFinance: (role: string) => ["owner", "admin", "manager"].includes(role),
  canViewFinanceData: (role: string) => ["owner", "admin", "manager", "viewer"].includes(role),
}));

vi.mock("@/lib/assigned-work-access", () => ({
  findAccessibleWorkOrder: findAccessibleWorkOrderMock,
  notFoundWorkOrder: () => Response.json({ error: "Arbetsordern hittades inte" }, { status: 404 }),
}));

vi.mock("@/lib/work-order-ops-storage", () => ({
  getModernMaterialEntry: getModernMaterialEntryMock,
  getMaterialEntry: getMaterialEntryMock,
  listMaterialEntries: listMaterialEntriesMock,
  upsertMaterialEntry: upsertMaterialEntryMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/work-orders/work-order-1/materials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

function materialEntry(overrides: Record<string, unknown> = {}) {
  return {
    entryId: "material-1",
    workOrderId: "work-order-1",
    articleNumber: null,
    name: "Filter",
    quantity: 2,
    unit: "st",
    unitPrice: 125,
    total: 250,
    supplier: null,
    stockStatus: "used",
    billable: true,
    note: null,
    status: "submitted",
    createdById: "tech-1",
    createdByName: "Tekniker",
    createdByEmail: "tech@example.com",
    actorId: "tech-1",
    createdAt: "2026-08-31T08:00:00.000Z",
    source: "table",
    ...overrides,
  };
}

describe("material-entry id isolation and attestation state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      email: "tech@example.com",
      name: "Tekniker",
      role: "technician",
      company_id: "company-1",
    });
    findAccessibleWorkOrderMock.mockResolvedValue({ id: "work-order-1", assigned_to_id: "tech-1", title: "Test" });
    listMaterialEntriesMock.mockResolvedValue([]);
    upsertMaterialEntryMock.mockImplementation(async (_companyId, payload) => payload);
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("uses a server-owned id for create even when the client supplies an id", async () => {
    const response = await POST(request({
      action: "create",
      entryId: "foreign-material-entry-id",
      name: "Filter",
      quantity: 2,
      unit: "st",
      unitPrice: 125,
      stockStatus: "used",
      billable: true,
    }), params);

    expect(response.status).toBe(201);
    expect(upsertMaterialEntryMock).toHaveBeenCalledTimes(1);
    const payload = upsertMaterialEntryMock.mock.calls[0][1];
    expect(payload.entryId).not.toBe("foreign-material-entry-id");
    expect(payload.entryId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(payload.workOrderId).toBe("work-order-1");
    expect(upsertMaterialEntryMock.mock.calls[0][0]).toBe("company-1");
    expect(getModernMaterialEntryMock).not.toHaveBeenCalled();
    expect(getMaterialEntryMock).not.toHaveBeenCalled();
  });

  it("requires an explicit id for mutation actions", async () => {
    const response = await POST(request({ action: "delete" }), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Materialrad-id krävs" });
    expect(getModernMaterialEntryMock).not.toHaveBeenCalled();
    expect(getMaterialEntryMock).not.toHaveBeenCalled();
    expect(upsertMaterialEntryMock).not.toHaveBeenCalled();
  });

  it("allows a manager to approve submitted material", async () => {
    getCurrentUserMock.mockResolvedValue(managerUser());
    getModernMaterialEntryMock.mockResolvedValue(materialEntry());

    const response = await POST(request({ action: "approve", entryId: "material-1" }), params);

    expect(response.status).toBe(201);
    const payload = upsertMaterialEntryMock.mock.calls[0][1];
    expect(payload.status).toBe("approved");
    expect(payload.total).toBe(250);
    expect(payload.actorId).toBe("manager-1");
  });

  it.each(["approved", "rejected", "deleted"] as const)("rejects approval from %s material state", async (status) => {
    getCurrentUserMock.mockResolvedValue(managerUser());
    getModernMaterialEntryMock.mockResolvedValue(materialEntry({ status }));

    const response = await POST(request({ action: "approve", entryId: "material-1" }), params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Materialraden kan bara attesteras när den är inskickad" });
    expect(upsertMaterialEntryMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it.each(["approved", "rejected", "deleted"] as const)("rejects rejection from %s material state", async (status) => {
    getCurrentUserMock.mockResolvedValue(managerUser());
    getModernMaterialEntryMock.mockResolvedValue(materialEntry({ status }));

    const response = await POST(request({ action: "reject", entryId: "material-1" }), params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Materialraden kan bara attesteras när den är inskickad" });
    expect(upsertMaterialEntryMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("allows a technician to delete their own submitted material", async () => {
    getModernMaterialEntryMock.mockResolvedValue(materialEntry());

    const response = await POST(request({ action: "delete", entryId: "material-1" }), params);

    expect(response.status).toBe(201);
    const payload = upsertMaterialEntryMock.mock.calls[0][1];
    expect(payload.status).toBe("deleted");
    expect(payload.actorId).toBe("tech-1");
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
  });

  it.each(["approved", "rejected", "deleted"] as const)("rejects deletion from %s material state", async (status) => {
    getModernMaterialEntryMock.mockResolvedValue(materialEntry({ status }));

    const response = await POST(request({ action: "delete", entryId: "material-1" }), params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Materialraden kan bara tas bort innan den har attesterats" });
    expect(upsertMaterialEntryMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
