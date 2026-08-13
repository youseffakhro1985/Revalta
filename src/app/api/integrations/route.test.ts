import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, integrationEventFindManyMock, invoiceJobGroupByMock, hasStorageConfigMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  integrationEventFindManyMock: vi.fn(),
  invoiceJobGroupByMock: vi.fn(),
  hasStorageConfigMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/storage", () => ({ hasStorageConfig: hasStorageConfigMock }));

vi.mock("@/lib/db", () => ({
  default: {
    integrationEvent: { findMany: integrationEventFindManyMock },
    workOrderInvoiceExportJob: { groupBy: invoiceJobGroupByMock },
  },
}));

import { GET } from "./route";

describe("integrations summary — invoice export counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    integrationEventFindManyMock.mockResolvedValue([]);
    hasStorageConfigMock.mockReturnValue(false);
  });

  it("aggregates invoice export job status counts via groupBy instead of fetching every row", async () => {
    invoiceJobGroupByMock.mockResolvedValue([
      { status: "queued", _count: { _all: 3 } },
      { status: "processing", _count: { _all: 1 } },
      { status: "failed", _count: { _all: 2 } },
      { status: "sent", _count: { _all: 40 } },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(invoiceJobGroupByMock).toHaveBeenCalledWith({
      by: ["status"],
      where: { company_id: "company-1" },
      _count: { _all: true },
    });
    expect(body.invoiceExportSummary).toEqual({
      total: 46,
      active: 4,
      failed: 2,
      sent: 40,
    });
  });

  it("returns zeroed counts when there are no invoice export jobs", async () => {
    invoiceJobGroupByMock.mockResolvedValue([]);

    const response = await GET();
    const body = await response.json();

    expect(body.invoiceExportSummary).toEqual({ total: 0, active: 0, failed: 0, sent: 0 });
  });
});
