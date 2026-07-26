import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  leaseFindFirstMock,
  leaseUpdateManyMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  leaseUpdateManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    lease: {
      findFirst: leaseFindFirstMock,
      updateMany: leaseUpdateManyMock,
    },
  },
}));

import { DELETE, PATCH } from "./route";

const params = Promise.resolve({ id: "lease-1" });

describe("leases/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    leaseUpdateManyMock.mockResolvedValue({ count: 1 });
  });

  it("PATCH requires active property filter and returns 404 for orphan leases", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    leaseFindFirstMock.mockResolvedValue(null);

    const response = await PATCH(new Request("http://localhost/api/leases/lease-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unitId: "unit-1",
        holderName: "Anna",
        holderType: "individual",
        status: "draft",
        monthlyRent: 10000,
        deposit: 10000,
        annualIndexPercent: 0,
        paymentTermsDays: 30,
      }),
    }), { params });

    expect(response.status).toBe(404);
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lease-1", company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
    }));
    expect(leaseUpdateManyMock).not.toHaveBeenCalled();
  });

  it("DELETE requires active property filter and returns 404 for orphan leases", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    leaseFindFirstMock.mockResolvedValue(null);

    const response = await DELETE(new Request("http://localhost/api/leases/lease-1"), { params });

    expect(response.status).toBe(404);
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lease-1", company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
    }));
    expect(leaseUpdateManyMock).not.toHaveBeenCalled();
  });
});
