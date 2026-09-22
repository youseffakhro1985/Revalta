import { beforeEach, describe, expect, it, vi } from "vitest";

const { leaseFindFirstMock, transactionMock } = vi.hoisted(() => ({
  leaseFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    lease: { findFirst: leaseFindFirstMock },
    leaseInspectionRecord: { findUnique: vi.fn() },
    integrationEvent: { findFirst: vi.fn() },
    $transaction: transactionMock,
  },
}));

import { createInspectionWorkOrders, InspectionWorkOrderError } from "./create-inspection-work-orders";

describe("createInspectionWorkOrders Tenant B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaseFindFirstMock.mockResolvedValue(null);
  });

  it("throws tenant-safe 404 when Tenant A uses a Tenant B lease id", async () => {
    await expect(createInspectionWorkOrders({
      companyId: "company-1",
      userId: "owner-1",
      leaseId: "lease-tenant-b",
      version: 1,
      itemIds: ["item-1"],
    })).rejects.toMatchObject({
      message: "Avtalet hittades inte",
      status: 404,
    } satisfies Partial<InspectionWorkOrderError>);

    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "lease-tenant-b",
        company_id: "company-1",
        deleted_at: null,
        property: { deleted_at: null },
      },
    }));
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
