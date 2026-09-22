import { beforeEach, describe, expect, it, vi } from "vitest";

const { leaseFindFirstMock, recordFindUniqueMock, readInspectionWorkOrdersMock } = vi.hoisted(() => ({
  leaseFindFirstMock: vi.fn(),
  recordFindUniqueMock: vi.fn(),
  readInspectionWorkOrdersMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    lease: { findFirst: leaseFindFirstMock },
    leaseInspectionRecord: { findUnique: recordFindUniqueMock },
    integrationEvent: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/read-inspection-work-orders", () => ({
  readInspectionWorkOrders: readInspectionWorkOrdersMock,
}));

import { reconcileInspectionRecord, InspectionRecordSyncError } from "./reconcile-inspection-record";

describe("reconcileInspectionRecord Tenant B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaseFindFirstMock.mockResolvedValue(null);
  });

  it("throws tenant-safe 404 when Tenant A reconciles a Tenant B lease id", async () => {
    await expect(reconcileInspectionRecord({
      companyId: "company-1",
      userId: "owner-1",
      userName: "Owner",
      userEmail: "owner@example.com",
      leaseId: "lease-tenant-b",
      version: 1,
    })).rejects.toMatchObject({
      message: "Avtalet hittades inte",
      status: 404,
    } satisfies Partial<InspectionRecordSyncError>);

    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "lease-tenant-b",
        company_id: "company-1",
        deleted_at: null,
        property: { deleted_at: null },
      },
    }));
    expect(recordFindUniqueMock).not.toHaveBeenCalled();
    expect(readInspectionWorkOrdersMock).not.toHaveBeenCalled();
  });
});
