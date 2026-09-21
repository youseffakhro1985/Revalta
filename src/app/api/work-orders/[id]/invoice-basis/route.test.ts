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

function postRequest(status: string, extra: Record<string, unknown> = {}) {
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
        unit: "h",
        unitPrice: 650,
        total: 650,
      }],
      ...extra,
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

  it("rejects ready without a customer name before creating a version", async () => {
    const response = await POST(postRequest("ready", { customerName: "  " }), params);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Kundnamn");
    expect(createInvoiceDraftMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
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

  it("tells the UI when approved rows can rebuild an empty persisted draft", async () => {
    listTimeEntriesMock.mockResolvedValue([{ status: "approved", billable: true, kind: "work", minutes: 60 }]);
    getLatestInvoiceDraftMock.mockResolvedValue({
      status: "draft",
      customerName: "Kund AB",
      lines: [],
    });

    const response = await GET(new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canBuildFromApproved).toBe(true);
    expect(body.hasPersistedDraft).toBe(true);
    expect(body.draft.lines).toEqual([]);
  });

  it("rebuilds draft lines from approved time without using client-supplied rows", async () => {
    listTimeEntriesMock.mockResolvedValue([{ status: "approved", billable: true, kind: "work", minutes: 90 }]);
    getLatestInvoiceDraftMock.mockResolvedValue({
      status: "draft",
      customerName: "Kund AB",
      customerOrgNumber: "556000-0000",
      vatPercent: 25,
      dueDays: 30,
      discountPercent: 0,
      lines: [],
    });

    const response = await POST(new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rebuild", lines: [] }),
    }), params);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(createInvoiceDraftMock).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        workOrderId: "wo-1",
        status: "draft",
        customerName: "Kund AB",
        lines: [expect.objectContaining({ type: "labor", unit: "tim", quantity: 1.5, unitPrice: 650 })],
      }),
      tx,
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "work_order.invoice_basis_rebuilt" }),
      tx,
    );
    expect(body.draft.status).toBe("draft");
  });

  it("does not rebuild a ready invoice draft", async () => {
    listTimeEntriesMock.mockResolvedValue([{ status: "approved", billable: true, kind: "work", minutes: 60 }]);
    getLatestInvoiceDraftMock.mockResolvedValue({ status: "ready", customerName: "Kund AB", lines: [] });

    const response = await POST(new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rebuild" }),
    }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("klart");
    expect(createInvoiceDraftMock).not.toHaveBeenCalled();
  });

  it("does not rebuild when nothing is attested", async () => {
    const response = await POST(new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rebuild" }),
    }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("attesterade");
    expect(createInvoiceDraftMock).not.toHaveBeenCalled();
  });

  it("marks a persisted draft ready from customer name without resending lines", async () => {
    getLatestInvoiceDraftMock.mockResolvedValue({
      status: "draft",
      customerName: "",
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
        description: "Arbete enligt arbetsorder",
        quantity: 1,
        unit: "tim",
        unitPrice: 650,
        total: 650,
      }],
    });

    const response = await POST(new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "markReady", customerName: "Kund AB" }),
    }), params);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(createInvoiceDraftMock).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        status: "ready",
        customerName: "Kund AB",
        lines: [expect.objectContaining({ description: "Arbete enligt arbetsorder", total: 650 })],
      }),
      tx,
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "work_order.invoice_basis_ready" }),
      tx,
    );
    expect(JSON.stringify(writeAuditLogMock.mock.calls[0]?.[1])).not.toMatch(/Kund AB|556000-0000/);
    expect(body.draft.status).toBe("ready");
  });

  it("requires customer name before marking the draft ready", async () => {
    getLatestInvoiceDraftMock.mockResolvedValue({
      status: "draft",
      lines: [{
        id: "line-1",
        type: "labor",
        description: "Arbete",
        quantity: 1,
        unit: "tim",
        unitPrice: 650,
        total: 650,
      }],
    });

    const response = await POST(new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "markReady", customerName: "  " }),
    }), params);

    expect(response.status).toBe(400);
    expect(createInvoiceDraftMock).not.toHaveBeenCalled();
  });

  it("does not mark a draft ready when it has no lines", async () => {
    getLatestInvoiceDraftMock.mockResolvedValue({ status: "draft", customerName: "Kund AB", lines: [] });

    const response = await POST(new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "markReady", customerName: "Kund AB" }),
    }), params);

    expect(response.status).toBe(409);
    expect(createInvoiceDraftMock).not.toHaveBeenCalled();
  });
});

describe("work-order invoice basis GET staff-scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects residents before loading invoice drafts", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await GET(
      new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis"),
      params,
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
    expect(getLatestInvoiceDraftMock).not.toHaveBeenCalled();
  });

  it("POST rejects residents before looking up a work order", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await POST(
      new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rebuild" }),
      }),
      params,
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
  });

  it("POST denies technicians with the finance-manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await POST(
      new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rebuild" }),
      }),
      params,
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
  });
});
