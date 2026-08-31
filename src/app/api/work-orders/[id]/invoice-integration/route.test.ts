import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  getLatestInvoiceDraftMock,
  getModernInvoiceExportJobMock,
  getModernLatestInvoiceDraftMock,
  listInvoiceExportJobsMock,
  upsertInvoiceExportJobMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  getLatestInvoiceDraftMock: vi.fn(),
  getModernInvoiceExportJobMock: vi.fn(),
  getModernLatestInvoiceDraftMock: vi.fn(),
  listInvoiceExportJobsMock: vi.fn(),
  upsertInvoiceExportJobMock: vi.fn(),
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

const params = { params: Promise.resolve({ id: "wo-1" }) };

function request(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-integration", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const invoice = {
  versionId: "invoice-v1",
  status: "ready",
  source: "table",
};

function existingJob(status: string) {
  return {
    jobId: `job-${status}`,
    workOrderId: "wo-1",
    provider: "webhook",
    status,
    attempt: 1,
    invoiceVersionId: "invoice-v1",
    createdById: "manager-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("work-order invoice integration — logical export idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("INVOICE_WEBHOOK_URL", "https://billing.example.test/invoices");
    vi.stubEnv("INVOICE_WEBHOOK_SECRET", "test-secret");
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      email: "manager@example.com",
      name: "Manager",
      role: "manager",
      company_id: "company-1",
    });
    workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", title: "Arbetsorder" });
    getModernLatestInvoiceDraftMock.mockResolvedValue(invoice);
    getLatestInvoiceDraftMock.mockResolvedValue(invoice);
    getModernInvoiceExportJobMock.mockResolvedValue(null);
    listInvoiceExportJobsMock.mockResolvedValue([]);
    upsertInvoiceExportJobMock.mockImplementation(async (_companyId, payload) => payload);
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("blocks a new queue when the same invoice version was already sent to the provider", async () => {
    listInvoiceExportJobsMock.mockResolvedValue([existingJob("sent")]);

    const response = await POST(request({ action: "queue", provider: "webhook" }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("redan exporterats");
    expect(upsertInvoiceExportJobMock).not.toHaveBeenCalled();
  });

  it("requires retrying the existing failed job instead of creating a new idempotency identity", async () => {
    listInvoiceExportJobsMock.mockResolvedValue([existingJob("failed")]);

    const response = await POST(request({ action: "queue", provider: "webhook" }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("Återförsök det befintliga jobbet");
    expect(upsertInvoiceExportJobMock).not.toHaveBeenCalled();
  });

  it("uses the same job id when concurrent queue requests both observe an empty job list", async () => {
    // Keep the list deliberately stale/empty for both requests to model two callers
    // passing the pre-check before either sees the other's write.
    listInvoiceExportJobsMock.mockResolvedValue([]);

    const first = await POST(request({ action: "queue", provider: "webhook" }), params);
    const second = await POST(request({ action: "queue", provider: "webhook" }), params);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(upsertInvoiceExportJobMock).toHaveBeenCalledTimes(2);
    const firstPayload = upsertInvoiceExportJobMock.mock.calls[0]?.[1];
    const secondPayload = upsertInvoiceExportJobMock.mock.calls[1]?.[1];
    expect(firstPayload.jobId).toMatch(/^iex_[0-9a-f]{40}$/);
    expect(secondPayload.jobId).toBe(firstPayload.jobId);
    expect(firstPayload.invoiceVersionId).toBe("invoice-v1");
  });

  it("does not claim that an already-processing provider request can be cancelled", async () => {
    getModernInvoiceExportJobMock.mockResolvedValue(existingJob("processing"));

    const response = await POST(request({ action: "cancel", jobId: "job-processing" }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("Endast köade exportjobb kan avbrytas säkert");
    expect(upsertInvoiceExportJobMock).not.toHaveBeenCalled();
  });
});
