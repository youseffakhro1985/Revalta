import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createLoggerMock, loggerErrorMock, loggerInfoMock, loggerWarnMock, updateManyMock, workOrderFindFirstMock, listQueuedMock, getModernJobMock, getModernDraftMock, getLegacyDraftMock, upsertJobMock } =
  vi.hoisted(() => ({
    createLoggerMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    loggerInfoMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    updateManyMock: vi.fn(),
    workOrderFindFirstMock: vi.fn(),
    listQueuedMock: vi.fn(),
    getModernJobMock: vi.fn(),
    getModernDraftMock: vi.fn(),
    getLegacyDraftMock: vi.fn(),
    upsertJobMock: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  default: {
    workOrderInvoiceExportJob: { updateMany: updateManyMock },
    workOrder: { findFirst: workOrderFindFirstMock },
  },
}));

vi.mock("@/lib/work-order-ops-storage", () => ({
  listQueuedInvoiceExportJobs: listQueuedMock,
  getModernInvoiceExportJob: getModernJobMock,
  getModernInvoiceDraftByVersion: getModernDraftMock,
  getInvoiceDraftByVersion: getLegacyDraftMock,
  upsertInvoiceExportJob: upsertJobMock,
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET } from "./route";

const baseJob = {
  jobId: "job-1",
  workOrderId: "wo-1",
  provider: "webhook",
  status: "queued",
  attempt: 1,
  invoiceVersionId: "v1",
  createdById: "user-1",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function cronRequest() {
  return new Request("https://www.revalta.se/api/cron/invoice-export-jobs", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

describe("invoice export cron — duplicate-submission guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({ debug: vi.fn(), info: loggerInfoMock, warn: loggerWarnMock, error: loggerErrorMock });
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.stubEnv("INVOICE_WEBHOOK_URL", "https://billing.example.test/invoices");
    vi.stubEnv("INVOICE_WEBHOOK_SECRET", "test-webhook-secret");
    listQueuedMock.mockResolvedValue([
      { companyId: "company-1", workOrderId: "wo-1", job: baseJob, createdAt: new Date() },
    ]);
    getModernJobMock.mockResolvedValue(baseJob);
    getLegacyDraftMock.mockResolvedValue(null);
    upsertJobMock.mockResolvedValue(baseJob);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("skips the job instead of re-sending it when the atomic claim loses the race", async () => {
    // Simulate a concurrent/retried cron invocation that already flipped this job's
    // status away from "queued" — the UPDATE ... WHERE status='queued' matches 0 rows.
    updateManyMock.mockResolvedValue({ count: 0 });

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: "job-1", company_id: "company-1", status: "queued" },
      data: expect.objectContaining({ status: "processing" }),
    });
    // Never fetched the work order or invoice draft, never attempted to send.
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
    expect(body).toEqual({ queued: 1, sent: 0, failed: 0, skipped: 1, reconciliationRequired: 0 });
  });

  it("proceeds to process the job when the atomic claim wins", async () => {
    updateManyMock.mockResolvedValue({ count: 1 });
    workOrderFindFirstMock.mockResolvedValue(null); // short-circuit before any network send

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(updateManyMock).toHaveBeenCalled();
    expect(workOrderFindFirstMock).toHaveBeenCalled();
    // Work order missing -> job recorded as failed, but the important assertion is
    // that we actually attempted processing (claim succeeded), not that it "sent".
    expect(body.failed).toBe(1);
    expect(body.reconciliationRequired).toBe(0);
  });

  it("persists a generic message for an unexpected per-job failure", async () => {
    updateManyMock.mockResolvedValue({ count: 1 });
    workOrderFindFirstMock.mockRejectedValue(new Error("postgres://user:secret@internal/revalta"));

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.failed).toBe(1);
    expect(upsertJobMock).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ status: "failed", error: "Exportjobbet misslyckades" }),
    );
    expect(JSON.stringify(upsertJobMock.mock.calls)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "invoice export job failed",
      expect.any(Error),
      expect.objectContaining({ event: "cron.invoice_exports.job_failed", jobId: "job-1" }),
    );
  });

  it("does not downgrade a provider-accepted export to retryable failed when receipt persistence fails", async () => {
    updateManyMock.mockResolvedValue({ count: 1 });
    workOrderFindFirstMock.mockResolvedValue({
      id: "wo-1",
      title: "Arbetsorder",
      property: { name: "Fastigheten", address: "Storgatan 1", postal_code: "411 01", city: "Göteborg" },
      unit: null,
      company: { name: "Bolaget AB", org_number: "556000-0000" },
    });
    getModernDraftMock.mockResolvedValue({
      versionId: "v1",
      workOrderId: "wo-1",
      status: "ready",
      lines: [],
      total: 1000,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("accepted", {
      status: 200,
      headers: { "x-external-id": "provider-123" },
    })));
    // The provider has already returned 2xx. Simulate only the subsequent local
    // receipt write failing.
    upsertJobMock.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(upsertJobMock).toHaveBeenCalledTimes(1);
    expect(upsertJobMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      jobId: "job-1",
      status: "sent",
      providerStatus: 200,
      externalId: "provider-123",
    }));
    // Critically, there is no second persistence call that turns the same export into
    // "failed" and therefore manually retryable after the provider already accepted it.
    expect(body).toEqual({ queued: 1, sent: 0, failed: 0, skipped: 0, reconciliationRequired: 1 });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "invoice export requires reconciliation after provider success",
      expect.any(Error),
      expect.objectContaining({ event: "cron.invoice_exports.reconciliation_required", jobId: "job-1", provider: "webhook" }),
    );
  });

  it("returns a safe correlated 500 when queue loading fails", async () => {
    listQueuedMock.mockRejectedValue(new Error("postgres://user:secret@internal/revalta"));

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe("INTERNAL_ERROR");
    expect(typeof body.requestId).toBe("string");
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "invoice export cron failed",
      expect.any(Error),
      expect.objectContaining({ event: "cron.invoice_exports.failed" }),
    );
  });

  it("returns 401 without a valid CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const response = await GET(new Request("https://www.revalta.se/api/cron/invoice-export-jobs"));
    expect(response.status).toBe(401);
    expect(listQueuedMock).not.toHaveBeenCalled();
  });
});
