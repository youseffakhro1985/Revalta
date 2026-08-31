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
  canManageTickets: () => true,
  canManageWorkOrderFinance: () => false,
  canViewFinanceData: () => false,
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

describe("material-entry id isolation", () => {
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
});
