import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  listTimeEntriesMock,
  listMaterialEntriesMock,
  getProfitabilitySettingsMock,
  getLatestInvoiceDraftMock,
  createInvoiceDraftMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  listTimeEntriesMock: vi.fn(),
  listMaterialEntriesMock: vi.fn(),
  getProfitabilitySettingsMock: vi.fn(),
  getLatestInvoiceDraftMock: vi.fn(),
  createInvoiceDraftMock: vi.fn(),
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
  getLatestInvoiceDraft: getLatestInvoiceDraftMock,
  createInvoiceDraft: createInvoiceDraftMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

import { GET, POST } from "./route";

const params = { params: Promise.resolve({ id: "wo-1" }) };
const tx = { marker: "invoice-draft-tx" };

function postRequest(status: string) {
  return new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      status,
      customerName: "Kund AB",
      customerOrgNumber: "556000-0000",
      customerReference: "Ref",
      invoiceDate: "2026-08-31",
      dueDays: 30,
      discountPercent: 0,
      vatPercent: 25,
      note: "",
      lines: [{
        id: "line-1",
        type: "labor",
        description: "Arbete",
        quantity: 1,
        unit: "tim",
        unitPrice: 650,
      }],
    }),
  });
}

describe("work-order invoice basis material approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      email: "manager@example.com",
      name: "Manager",
      role: "manager",
      company_id: "company-1",
    });
    workOrderFindFirstMock.mockResolvedValue({
      id: "wo-1",
      title: "Byte av filter",
      status: "completed",
      property: { name: "Fastigheten", address: "Storgatan 1", postal_code: "411 01", city: "Göteborg" },
      unit: null,
      company: { name: "Bolaget AB", org_number: "556000-0000" },
    });
    listTimeEntriesMock.mockResolvedValue([]);
    listMaterialEntriesMock.mockResolvedValue([]);
    getProfitabilitySettingsMock.mockResolvedValue({
      customerHourlyRate: 650,
      materialMarkupPercent: 15,
      fixedRevenue: 0,
    });
    getLatestInvoiceDraftMock.mockResolvedValue(null);
    createInvoiceDraftMock.mockImplementation(async (_companyId, payload) => payload);
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("includes only approved billable material in generated invoice source and lines", async () => {
    listMaterialEntriesMock.mockResolvedValue([
      { entryId: "approved", status: "approved", total: 100, billable: true },
      { entryId: "approved-private", status: "approved", total: 50, billable: false },
      { entryId: "submitted", status: "submitted", total: 900, billable: true },
      { entryId: "rejected", status: "rejected", total: 700, billable: true },
      { entryId: "deleted", status: "deleted", total: 500, billable: true },
    ]);

    const response = await GET(new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source.billableMaterial).toBe(100);
    const materialLines = body.draft.lines.filter((line: { type: string }) => line.type === "material");
    expect(materialLines).toHaveLength(1);
    expect(materialLines[0]).toEqual(expect.objectContaining({
      type: "material",
      description: "Material enligt arbetsorder",
      quantity: 1,
      unit: "st",
      unitPrice: 115,
      total: 115,
    }));
  });

  it("generates no material invoice line while all billable material is awaiting approval", async () => {
    listMaterialEntriesMock.mockResolvedValue([
      { entryId: "submitted", status: "submitted", total: 900, billable: true },
    ]);

    const response = await GET(new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source.billableMaterial).toBe(0);
    expect(body.draft.lines.some((line: { type: string }) => line.type === "material")).toBe(false);
  });

  it("does not let a finance client fabricate exported state on an invoice version", async () => {
    const response = await POST(postRequest("exported"), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("kan inte sättas via fakturaunderlaget");
    expect(body.error).toContain("exportjobbet");
    expect(createInvoiceDraftMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("still allows the canonical ready transition and audits it in the same transaction", async () => {
    const response = await POST(postRequest("ready"), params);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(createInvoiceDraftMock).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ workOrderId: "wo-1", status: "ready" }),
      tx,
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "manager-1", company_id: "company-1" }),
      expect.objectContaining({ entityType: "work_order", entityId: "wo-1", action: "work_order.invoice_basis_ready" }),
      tx,
    );
    expect(body.draft.status).toBe("ready");
  });

  it("does not report success when the mandatory invoice audit write fails", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    await expect(POST(postRequest("draft"), params)).rejects.toThrow("audit unavailable");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(createInvoiceDraftMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "work_order.invoice_basis_draft" }),
      tx,
    );
  });

  it("rejects malformed JSON before creating an invoice version", async () => {
    const malformed = new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });

    const response = await POST(malformed, params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Ogiltigt innehåll" });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(createInvoiceDraftMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
