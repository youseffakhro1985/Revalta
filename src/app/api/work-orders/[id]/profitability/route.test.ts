import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  listTimeEntriesMock,
  listMaterialEntriesMock,
  getProfitabilitySettingsMock,
  getModernProfitabilitySettingsMock,
  upsertProfitabilitySettingsMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  listTimeEntriesMock: vi.fn(),
  listMaterialEntriesMock: vi.fn(),
  getProfitabilitySettingsMock: vi.fn(),
  getModernProfitabilitySettingsMock: vi.fn(),
  upsertProfitabilitySettingsMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/work-order-ops-storage", () => ({
  listTimeEntries: listTimeEntriesMock,
  listMaterialEntries: listMaterialEntriesMock,
  getProfitabilitySettings: getProfitabilitySettingsMock,
  getModernProfitabilitySettings: getModernProfitabilitySettingsMock,
  upsertProfitabilitySettings: upsertProfitabilitySettingsMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

import { GET, POST } from "./route";

const params = { params: Promise.resolve({ id: "wo-1" }) };
const tx = { marker: "profitability-tx" };

function managerUser() {
  return {
    id: "manager-1",
    email: "manager@example.com",
    name: "Manager",
    company_id: "company-1",
    role: "manager",
  };
}

function postRequest(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/work-orders/wo-1/profitability", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("work-order profitability route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workOrderFindFirstMock.mockResolvedValue({
      id: "wo-1",
      title: "Byte av packning",
      estimated_cost: null,
      actual_cost: null,
    });
    listTimeEntriesMock.mockResolvedValue([]);
    listMaterialEntriesMock.mockResolvedValue([]);
    getProfitabilitySettingsMock.mockResolvedValue({
      internalHourlyCost: 350,
      customerHourlyRate: 650,
      materialMarkupPercent: 15,
      otherCost: 0,
      fixedRevenue: 0,
    });
    getModernProfitabilitySettingsMock.mockResolvedValue({
      internalHourlyCost: 350,
      customerHourlyRate: 650,
      materialMarkupPercent: 15,
      otherCost: 0,
      fixedRevenue: 0,
      source: "table",
    });
    upsertProfitabilitySettingsMock.mockImplementation(async (_companyId, _workOrderId, _userId, settings) => settings);
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("denies technicians from reading profitability", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await GET(new Request("https://www.revalta.se/api/work-orders/wo-1/profitability"), params);

    expect(response.status).toBe(403);
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
  });

  it("allows managers to read profitability", async () => {
    getCurrentUserMock.mockResolvedValue(managerUser());

    const response = await GET(new Request("https://www.revalta.se/api/work-orders/wo-1/profitability"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canManage).toBe(true);
  });

  it("allows viewers to read but not manage profitability", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });

    const response = await GET(new Request("https://www.revalta.se/api/work-orders/wo-1/profitability"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canManage).toBe(false);
  });

  it("uses only approved material in official profitability", async () => {
    getCurrentUserMock.mockResolvedValue(managerUser());
    listMaterialEntriesMock.mockResolvedValue([
      { entryId: "approved", status: "approved", total: 100, billable: true },
      { entryId: "submitted", status: "submitted", total: 900, billable: true },
      { entryId: "rejected", status: "rejected", total: 700, billable: true },
      { entryId: "deleted", status: "deleted", total: 500, billable: true },
    ]);

    const response = await GET(new Request("https://www.revalta.se/api/work-orders/wo-1/profitability"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.materialCost).toBe(100);
    expect(body.summary.billableMaterial).toBe(100);
    expect(body.summary.materialRevenue).toBe(115);
    expect(body.summary.totalCost).toBe(100);
    expect(body.summary.totalRevenue).toBe(115);
    expect(body.summary.margin).toBe(15);
  });

  it("persists profitability settings and mandatory audit in the same transaction", async () => {
    getCurrentUserMock.mockResolvedValue(managerUser());

    const response = await POST(postRequest({
      internalHourlyCost: 420,
      customerHourlyRate: 790,
      materialMarkupPercent: 20,
      otherCost: 1250,
      fixedRevenue: 3000,
    }), params);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(upsertProfitabilitySettingsMock).toHaveBeenCalledWith(
      "company-1",
      "wo-1",
      "manager-1",
      {
        internalHourlyCost: 420,
        customerHourlyRate: 790,
        materialMarkupPercent: 20,
        otherCost: 1250,
        fixedRevenue: 3000,
      },
      tx,
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "manager-1", company_id: "company-1" }),
      expect.objectContaining({ entityType: "work_order", entityId: "wo-1", action: "work_order.profitability_updated" }),
      tx,
    );
    expect(body.settings).toEqual(expect.objectContaining({ customerHourlyRate: 790, source: "table" }));
  });

  it("does not report success when profitability audit persistence fails", async () => {
    getCurrentUserMock.mockResolvedValue(managerUser());
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    await expect(POST(postRequest({ customerHourlyRate: 700 }), params)).rejects.toThrow("audit unavailable");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(upsertProfitabilitySettingsMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "work_order.profitability_updated" }),
      tx,
    );
  });

  it("rejects malformed JSON before profitability storage mutation", async () => {
    getCurrentUserMock.mockResolvedValue(managerUser());
    const malformed = new Request("https://www.revalta.se/api/work-orders/wo-1/profitability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });

    const response = await POST(malformed, params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Ogiltigt innehåll" });
    expect(getModernProfitabilitySettingsMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(upsertProfitabilitySettingsMock).not.toHaveBeenCalled();
  });

  it("blocks writes while legacy profitability settings have not been backfilled", async () => {
    getCurrentUserMock.mockResolvedValue(managerUser());
    getModernProfitabilitySettingsMock.mockResolvedValue(null);
    getProfitabilitySettingsMock.mockResolvedValue({
      internalHourlyCost: 350,
      customerHourlyRate: 650,
      materialMarkupPercent: 15,
      otherCost: 0,
      fixedRevenue: 0,
      source: "legacy",
    });

    const response = await POST(postRequest({ customerHourlyRate: 700 }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("backfill");
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
