import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  getLatestInvoiceDraftMock,
  getModernInvoiceExportJobMock,
  getModernLatestInvoiceDraftMock,
  listInvoiceExportJobsMock,
  upsertInvoiceExportJobMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  getLatestInvoiceDraftMock: vi.fn(),
  getModernInvoiceExportJobMock: vi.fn(),
  getModernLatestInvoiceDraftMock: vi.fn(),
  listInvoiceExportJobsMock: vi.fn(),
  upsertInvoiceExportJobMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageWorkOrderFinance: () => true,
  canViewFinanceData: () => true,
}));
vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock },
    $transaction: transactionMock,
  },
}));
vi.mock("@/lib/work-order-ops-storage", () => ({
  getLatestInvoiceDraft: getLatestInvoiceDraftMock,
  getModernInvoiceExportJob: getModernInvoiceExportJobMock,
  getModernLatestInvoiceDraft: getModernLatestInvoiceDraftMock,
  listInvoiceExportJobs: listInvoiceExportJobsMock,
  upsertInvoiceExportJob: upsertInvoiceExportJobMock,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

import { POST } from "./route";

const params = { params: Promise.resolve({ id: "foreign-work-order" }) };

describe("invoice-integration tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("INVOICE_WEBHOOK_URL", "https://billing.example.test/invoices");
    vi.stubEnv("INVOICE_WEBHOOK_SECRET", "test-secret");
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      role: "manager",
      company_id: "company-1",
    });
    workOrderFindFirstMock.mockResolvedValue(null);
  });

  it("returns 404 for another company's work order before reading invoice state or queuing export", async () => {
    const request = new Request(
      "https://www.revalta.se/api/work-orders/foreign-work-order/invoice-integration",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "queue", provider: "webhook" }),
      },
    );

    const response = await POST(request, params);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Arbetsordern hittades inte" });
    expect(workOrderFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "foreign-work-order",
        company_id: "company-1",
        deleted_at: null,
      }),
    }));
    expect(getModernLatestInvoiceDraftMock).not.toHaveBeenCalled();
    expect(getLatestInvoiceDraftMock).not.toHaveBeenCalled();
    expect(getModernInvoiceExportJobMock).not.toHaveBeenCalled();
    expect(listInvoiceExportJobsMock).not.toHaveBeenCalled();
    expect(upsertInvoiceExportJobMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
