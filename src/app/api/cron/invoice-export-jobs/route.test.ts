import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateManyMock, workOrderFindFirstMock, listQueuedMock, getModernJobMock, getModernDraftMock, getLegacyDraftMock, upsertJobMock } =
  vi.hoisted(() => ({
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
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    listQueuedMock.mockResolvedValue([
      { companyId: "company-1", workOrderId: "wo-1", job: baseJob, createdAt: new Date() },
    ]);
    getModernJobMock.mockResolvedValue(baseJob);
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
    expect(body).toEqual({ queued: 1, sent: 0, failed: 0, skipped: 1 });
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
  });

  it("returns 401 without a valid CRON_SECRET", async () => {
    const response = await GET(new Request("https://www.revalta.se/api/cron/invoice-export-jobs"));
    expect(response.status).toBe(401);
    expect(listQueuedMock).not.toHaveBeenCalled();
  });
});
