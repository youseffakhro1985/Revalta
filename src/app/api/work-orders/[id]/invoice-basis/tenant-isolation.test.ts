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

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canViewFinanceData: () => true,
  canManageWorkOrderFinance: () => true,
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

import { GET } from "./route";

const params = { params: Promise.resolve({ id: "foreign-work-order" }) };

describe("invoice-basis tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      role: "manager",
      company_id: "company-1",
    });
    workOrderFindFirstMock.mockResolvedValue(null);
  });

  it("returns 404 for another company's work order before loading any financial source data", async () => {
    const response = await GET(
      new Request("https://www.revalta.se/api/work-orders/foreign-work-order/invoice-basis"),
      params,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Arbetsordern hittades inte" });
    expect(workOrderFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "foreign-work-order",
        company_id: "company-1",
        deleted_at: null,
      }),
    }));
    expect(listTimeEntriesMock).not.toHaveBeenCalled();
    expect(listMaterialEntriesMock).not.toHaveBeenCalled();
    expect(getProfitabilitySettingsMock).not.toHaveBeenCalled();
    expect(getLatestInvoiceDraftMock).not.toHaveBeenCalled();
    expect(createInvoiceDraftMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
