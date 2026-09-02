import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  canManageTicketsMock,
  workOrderFindFirstMock,
  operationalDocumentFindManyMock,
  directQueryRawMock,
  directExecuteRawMock,
  transactionMock,
  txQueryRawMock,
  txExecuteRawMock,
  writeAuditLogMock,
  listTimeEntriesMock,
  listMaterialEntriesMock,
  getProfitabilitySettingsMock,
  createInvoiceDraftMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  canManageTicketsMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  operationalDocumentFindManyMock: vi.fn(),
  directQueryRawMock: vi.fn(),
  directExecuteRawMock: vi.fn(),
  transactionMock: vi.fn(),
  txQueryRawMock: vi.fn(),
  txExecuteRawMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  listTimeEntriesMock: vi.fn(),
  listMaterialEntriesMock: vi.fn(),
  getProfitabilitySettingsMock: vi.fn(),
  createInvoiceDraftMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageTickets: canManageTicketsMock,
}));

vi.mock("@/lib/assigned-work-access", () => ({
  isAssignedWorkAccessible: vi.fn(() => true),
  notFoundWorkOrder: vi.fn(() => new Response(JSON.stringify({ error: "Arbetsordern hittades inte" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  })),
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

vi.mock("@/lib/work-order-ops-storage", () => ({
  createInvoiceDraft: createInvoiceDraftMock,
  getProfitabilitySettings: getProfitabilitySettingsMock,
  listMaterialEntries: listMaterialEntriesMock,
  listTimeEntries: listTimeEntriesMock,
}));

const tx = {
  $queryRaw: txQueryRawMock,
  $executeRaw: txExecuteRawMock,
};

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock },
    operationalDocument: { findMany: operationalDocumentFindManyMock },
    $queryRaw: directQueryRawMock,
    $executeRaw: directExecuteRawMock,
    $transaction: transactionMock,
  },
}));

import { POST } from "./route";

const user = { id: "user-1", company_id: "company-1", role: "owner" };
const workOrder = {
  id: "wo-1",
  title: "Byt cirkulationspump",
  assigned_to_id: null,
  property: { id: "property-1", name: "Storgatan 1", address: "Storgatan 1", city: "Göteborg" },
  unit: null,
  assigned_to: null,
};
const context = { params: Promise.resolve({ id: "wo-1" }) };

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/work-orders/wo-1/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("work-order reports route atomicity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(user);
    canManageTicketsMock.mockReturnValue(true);
    workOrderFindFirstMock.mockResolvedValue(workOrder);
    operationalDocumentFindManyMock.mockResolvedValue([]);
    directQueryRawMock.mockResolvedValue([]);
    directExecuteRawMock.mockResolvedValue(1);
    txQueryRawMock.mockResolvedValue([{ next_version: 1 }]);
    txExecuteRawMock.mockResolvedValue(1);
    writeAuditLogMock.mockResolvedValue(undefined);
    listTimeEntriesMock.mockResolvedValue([]);
    listMaterialEntriesMock.mockResolvedValue([]);
    getProfitabilitySettingsMock.mockResolvedValue({
      customerHourlyRate: 650,
      materialMarkupPercent: 15,
      fixedRevenue: 0,
    });
    createInvoiceDraftMock.mockResolvedValue({ versionId: "version-1", status: "draft" });
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("records signatures and mandatory audit in one transaction", async () => {
    const response = await POST(request({
      action: "signature.create",
      signerRole: "executor",
      signerName: "Anna Tekniker",
    }), context);

    expect(response.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txExecuteRawMock).toHaveBeenCalledTimes(1);
    expect(directExecuteRawMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ action: "work_order.signature_recorded" }),
      tx,
    );
  });

  it("creates reports and mandatory audit through the transaction client", async () => {
    const response = await POST(request({ action: "report.create" }), context);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.version).toBe(1);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txQueryRawMock).toHaveBeenCalledTimes(1);
    expect(txExecuteRawMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ action: "work_order.report_created" }),
      tx,
    );
  });

  it("approves reports and audit atomically", async () => {
    const response = await POST(request({ action: "report.approve", reportId: "report-1" }), context);

    expect(response.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txExecuteRawMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ action: "work_order.report_approved" }),
      tx,
    );
  });

  it("creates the canonical invoice draft, archive and audit in one transaction", async () => {
    listTimeEntriesMock.mockResolvedValue([{ status: "approved", billable: true, kind: "work", minutes: 60 }]);

    const response = await POST(request({ action: "invoice.create" }), context);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.total).toBe(812.5);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(createInvoiceDraftMock).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ workOrderId: "wo-1", subtotal: 650, vat: 162.5, total: 812.5 }),
      tx,
    );
    expect(txExecuteRawMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ action: "work_order.invoice_basis_created" }),
      tx,
    );
  });

  it("excludes billable material until it is approved", async () => {
    listTimeEntriesMock.mockResolvedValue([{ status: "approved", billable: true, kind: "work", minutes: 60 }]);
    listMaterialEntriesMock.mockResolvedValue([{ status: "pending", billable: true, total: 1000 }]);

    const response = await POST(request({ action: "invoice.create" }), context);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.total).toBe(812.5);
    expect(createInvoiceDraftMock).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ subtotal: 650, total: 812.5 }),
      tx,
    );
  });

  it("approves invoice basis and audit atomically", async () => {
    const response = await POST(request({ action: "invoice.approve", invoiceId: "invoice-1" }), context);

    expect(response.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txExecuteRawMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ action: "work_order.invoice_basis_approved" }),
      tx,
    );
  });

  it("propagates audit failure from inside the transaction", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    await expect(POST(request({
      action: "signature.create",
      signerRole: "executor",
      signerName: "Anna Tekniker",
    }), context)).rejects.toThrow("audit unavailable");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txExecuteRawMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx);
  });
});
