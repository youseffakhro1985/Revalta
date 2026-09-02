import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { GET, POST } from "./route";

const params = { params: Promise.resolve({ id: "wo-1" }) };
const tx = { marker: "invoice-export-tx" };

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

function existingJob(status: string, overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

describe("work-order invoice integration — logical export idempotency and reconciliation", () => {
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
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks a new queue when the same invoice version was already sent to the provider", async () => {
    listInvoiceExportJobsMock.mockResolvedValue([existingJob("sent")]);

    const response = await POST(request({ action: "queue", provider: "webhook" }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("redan exporterats");
    expect(upsertInvoiceExportJobMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("blocks a historically exported invoice version even when no modern export job is present", async () => {
    const exportedInvoice = { ...invoice, status: "exported" };
    getModernLatestInvoiceDraftMock.mockResolvedValue(exportedInvoice);
    getLatestInvoiceDraftMock.mockResolvedValue(exportedInvoice);
    listInvoiceExportJobsMock.mockResolvedValue([]);

    const response = await POST(request({ action: "queue", provider: "webhook" }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("markerad som exporterad");
    expect(listInvoiceExportJobsMock).not.toHaveBeenCalled();
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
    expect(upsertInvoiceExportJobMock.mock.calls[0]?.[2]).toBe(tx);
    expect(upsertInvoiceExportJobMock.mock.calls[1]?.[2]).toBe(tx);
  });

  it("blocks a legacy cancelled export whose provider outcome may be ambiguous", async () => {
    listInvoiceExportJobsMock.mockResolvedValue([existingJob("cancelled")]);

    const response = await POST(request({ action: "queue", provider: "webhook" }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("oklar leverantörsstatus");
    expect(upsertInvoiceExportJobMock).not.toHaveBeenCalled();
  });

  it("requeues a safely cancelled hardened export with the same idempotency identity", async () => {
    listInvoiceExportJobsMock.mockResolvedValue([]);
    const first = await POST(request({ action: "queue", provider: "webhook" }), params);
    expect(first.status).toBe(201);
    const firstPayload = upsertInvoiceExportJobMock.mock.calls[0]?.[1];
    const stableJobId = firstPayload.jobId;

    listInvoiceExportJobsMock.mockResolvedValue([{
      ...existingJob("cancelled"),
      jobId: stableJobId,
      attempt: 1,
    }]);
    const second = await POST(request({ action: "queue", provider: "webhook" }), params);

    expect(second.status).toBe(201);
    const secondPayload = upsertInvoiceExportJobMock.mock.calls[1]?.[1];
    expect(secondPayload.jobId).toBe(stableJobId);
    expect(secondPayload.attempt).toBe(2);
  });

  it("does not claim that an already-processing provider request can be cancelled", async () => {
    getModernInvoiceExportJobMock.mockResolvedValue(existingJob("processing"));

    const response = await POST(request({ action: "cancel", jobId: "job-processing" }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("Endast köade exportjobb kan avbrytas säkert");
    expect(upsertInvoiceExportJobMock).not.toHaveBeenCalled();
  });

  it("marks only stale modern processing jobs as eligible for manual reconciliation", async () => {
    listInvoiceExportJobsMock.mockResolvedValue([
      existingJob("processing", {
        jobId: "stale-job",
        source: "table",
        processingStartedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      }),
      existingJob("processing", {
        jobId: "fresh-job",
        source: "table",
        processingStartedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      }),
      existingJob("processing", {
        jobId: "legacy-job",
        source: "legacy",
        processingStartedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      }),
    ]);

    const response = await GET(new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-integration"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jobs.find((job: { jobId: string }) => job.jobId === "stale-job").reconciliationEligible).toBe(true);
    expect(body.jobs.find((job: { jobId: string }) => job.jobId === "fresh-job").reconciliationEligible).toBe(false);
    expect(body.jobs.find((job: { jobId: string }) => job.jobId === "legacy-job").reconciliationEligible).toBe(false);
  });

  it("refuses reconciliation while a processing job can still be active", async () => {
    getModernInvoiceExportJobMock.mockResolvedValue(existingJob("processing", {
      processingStartedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      source: "table",
    }));

    const response = await POST(request({
      action: "reconcile",
      jobId: "job-processing",
      resolution: "sent",
      note: "Kontrollerad hos leverantören och bekräftad som skickad.",
    }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("fortfarande aktivt");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("reconciles a stale processing job as sent with job state and audit in one transaction", async () => {
    const stale = existingJob("processing", {
      processingStartedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      source: "table",
      externalId: null,
    });
    getModernInvoiceExportJobMock.mockResolvedValue(stale);

    const response = await POST(request({
      action: "reconcile",
      jobId: "job-processing",
      resolution: "sent",
      note: "Kontrollerad manuellt hos Fortnox och fakturan är mottagen.",
      externalId: "FTX-12345",
    }), params);

    expect(response.status).toBe(201);
    expect(upsertInvoiceExportJobMock).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        status: "sent",
        externalId: "FTX-12345",
        actedById: "manager-1",
        sentAt: expect.any(String),
      }),
      tx,
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "manager-1", company_id: "company-1" }),
      expect.objectContaining({
        action: "work_order.invoice_integration_reconcile_sent",
        metadata: expect.objectContaining({
          reconciliationResolution: "sent",
          reconciliationNote: "Kontrollerad manuellt hos Fortnox och fakturan är mottagen.",
          externalId: "FTX-12345",
        }),
      }),
      tx,
    );
  });

  it("reconciles a stale processing job as failed without making it look provider-accepted", async () => {
    getModernInvoiceExportJobMock.mockResolvedValue(existingJob("processing", {
      processingStartedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      source: "table",
    }));

    const response = await POST(request({
      action: "reconcile",
      jobId: "job-processing",
      resolution: "failed",
      note: "Kontrollerad hos leverantören; ingen faktura skapades externt.",
    }), params);

    expect(response.status).toBe(201);
    expect(upsertInvoiceExportJobMock).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        status: "failed",
        error: "Kontrollerad hos leverantören; ingen faktura skapades externt.",
        failedAt: expect.any(String),
      }),
      tx,
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "work_order.invoice_integration_reconcile_failed" }),
      tx,
    );
  });

  it("requires a meaningful reconciliation note", async () => {
    getModernInvoiceExportJobMock.mockResolvedValue(existingJob("processing", {
      processingStartedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      source: "table",
    }));

    const response = await POST(request({
      action: "reconcile",
      jobId: "job-processing",
      resolution: "sent",
      note: "ok",
    }), params);

    expect(response.status).toBe(400);
    expect(upsertInvoiceExportJobMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("persists the export job and mandatory audit event in the same transaction", async () => {
    const response = await POST(request({ action: "queue", provider: "webhook" }), params);

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(upsertInvoiceExportJobMock).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ workOrderId: "wo-1", provider: "webhook", status: "queued" }),
      tx,
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "manager-1", company_id: "company-1" }),
      expect.objectContaining({
        entityType: "work_order",
        entityId: "wo-1",
        action: "work_order.invoice_integration_queue",
      }),
      tx,
    );
  });

  it("does not report success when mandatory audit persistence fails", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    await expect(POST(request({ action: "queue", provider: "webhook" }), params)).rejects.toThrow("audit unavailable");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(upsertInvoiceExportJobMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "work_order.invoice_integration_queue" }),
      tx,
    );
  });

  it("does not report reconciliation success when mandatory audit persistence fails", async () => {
    getModernInvoiceExportJobMock.mockResolvedValue(existingJob("processing", {
      processingStartedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      source: "table",
    }));
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    await expect(POST(request({
      action: "reconcile",
      jobId: "job-processing",
      resolution: "sent",
      note: "Kontrollerad hos leverantören och bekräftad som skickad.",
    }), params)).rejects.toThrow("audit unavailable");

    expect(upsertInvoiceExportJobMock).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ status: "sent" }),
      tx,
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "work_order.invoice_integration_reconcile_sent" }),
      tx,
    );
  });

  it("rejects malformed JSON before creating an export job", async () => {
    const malformed = new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-integration", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });

    const response = await POST(malformed, params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Ogiltigt innehåll" });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(upsertInvoiceExportJobMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
