import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  updateManyMock,
  workOrderFindFirstMock,
  listQueuedMock,
  getModernJobMock,
  getModernDraftMock,
  getLegacyDraftMock,
  upsertJobMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  updateManyMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  listQueuedMock: vi.fn(),
  getModernJobMock: vi.fn(),
  getModernDraftMock: vi.fn(),
  getLegacyDraftMock: vi.fn(),
  upsertJobMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
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

const requestId = "550e8400-e29b-41d4-a716-446655440000";
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
    headers: { authorization: "Bearer test-cron-secret", "x-request-id": requestId },
  });
}

describe("invoice export cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    listQueuedMock.mockResolvedValue([
      { companyId: "company-1", workOrderId: "wo-1", job: baseJob, createdAt: new Date() },
    ]);
    getModernJobMock.mockResolvedValue(baseJob);
    upsertJobMock.mockResolvedValue({});
  });

  it("skips the job instead of re-sending it when the atomic claim loses the race", async () => {
    updateManyMock.mockResolvedValue({ count: 0 });

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: "job-1", company_id: "company-1", status: "queued" },
      data: expect.objectContaining({ status: "processing" }),
    });
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
    expect(body).toEqual({ queued: 1, sent: 0, failed: 0, skipped: 1 });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "invoice export cron completed",
      expect.objectContaining({ event: "cron.completed", job: "invoice_export_jobs", queued: 1, sent: 0, failed: 0, skipped: 1 }),
    );
  });

  it("records a failed job but only logs aggregate counters when processing fails", async () => {
    updateManyMock.mockResolvedValue({ count: 1 });
    workOrderFindFirstMock.mockResolvedValue(null);

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(updateManyMock).toHaveBeenCalled();
    expect(workOrderFindFirstMock).toHaveBeenCalled();
    expect(body.failed).toBe(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "invoice export cron partially failed",
      expect.objectContaining({ event: "cron.partial_failure", job: "invoice_export_jobs", failed: 1 }),
    );
    const logs = JSON.stringify([loggerInfoMock.mock.calls, loggerWarnMock.mock.calls]);
    expect(logs).not.toContain("Arbetsordern hittades inte längre");
    expect(logs).not.toContain("job-1");
    expect(logs).not.toContain("wo-1");
  });

  it("returns a correlated private 401 without a valid CRON_SECRET", async () => {
    const response = await GET(new Request("https://www.revalta.se/api/cron/invoice-export-jobs", {
      headers: { "x-request-id": requestId },
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(listQueuedMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("test-cron-secret");
  });

  it("returns a safe correlated 500 for a total storage failure", async () => {
    listQueuedMock.mockRejectedValue(new Error("FORTNOX_ACCESS_TOKEN=super-secret"));

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Cron-körningen misslyckades", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("super-secret");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "invoice export cron failed",
      expect.any(Error),
      expect.objectContaining({ event: "cron.failed", job: "invoice_export_jobs" }),
    );
  });
});
