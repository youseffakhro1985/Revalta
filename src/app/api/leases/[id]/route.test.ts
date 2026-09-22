import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  leaseFindFirstMock,
  leaseUpdateManyMock,
  writeAuditLogMock,
  unitFindFirstMock,
  leaseHolderFindFirstMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  leaseUpdateManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  unitFindFirstMock: vi.fn(),
  leaseHolderFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
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
    $transaction: transactionMock,
  },
}));

import { DELETE, PATCH } from "./route";

const params = Promise.resolve({ id: "lease-1" });

describe("leases/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    leaseUpdateManyMock.mockResolvedValue({ count: 1 });
    unitFindFirstMock.mockResolvedValue(null);
    leaseHolderFindFirstMock.mockResolvedValue(null);
    transactionMock.mockImplementation(async (callback: (tx: {
      unit: { findFirst: typeof unitFindFirstMock };
      lease: { findFirst: ReturnType<typeof vi.fn> };
      leaseHolder: { findFirst: typeof leaseHolderFindFirstMock; updateMany: ReturnType<typeof vi.fn> };
    }) => unknown) => callback({
      unit: { findFirst: unitFindFirstMock },
      lease: { findFirst: vi.fn() },
      leaseHolder: { findFirst: leaseHolderFindFirstMock, updateMany: vi.fn() },
    }));
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

  it("PATCH denies residents before looking up a lease", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-a",
      company_id: "company-a",
      role: "resident",
      email: "boende-a@exempel.se",
    });

    const response = await PATCH(new Request("http://localhost/api/leases/lease-tenant-b", {
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
    }), { params: Promise.resolve({ id: "lease-tenant-b" }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("DELETE denies residents before looking up a lease", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-a",
      company_id: "company-a",
      role: "resident",
    });

    const response = await DELETE(
      new Request("http://localhost/api/leases/lease-tenant-b"),
      { params: Promise.resolve({ id: "lease-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("PATCH denies technicians with the lease-manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await PATCH(new Request("http://localhost/api/leases/lease-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "draft" }),
    }), { params });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att hantera avtal");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("PATCH returns 404 when the lease holder is outside the authenticated company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    leaseFindFirstMock.mockResolvedValue({
      id: "lease-1",
      company_id: "company-1",
      lease_holder_id: "holder-1",
      unit_id: "unit-1",
      lease_number: "AVT-2026-TEST",
      status: "draft",
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
      ended_at: null,
      lease_holder: { id: "holder-1" },
    });
    unitFindFirstMock.mockResolvedValue({
      id: "unit-1",
      unit_type: "apartment",
      property_id: "property-1",
      property: { id: "property-1", name: "Eken", address: "Testgatan 1", city: "Stockholm" },
    });
    leaseHolderFindFirstMock.mockResolvedValue(null);

    const response = await PATCH(new Request("http://localhost/api/leases/lease-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unitId: "unit-1",
        holderId: "foreign-holder",
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
    expect((await response.json()).error).toBe("Hyresparten hittades inte");
    expect(leaseHolderFindFirstMock).toHaveBeenCalledWith({
      where: { deleted_at: null, id: "foreign-holder", company_id: "company-1" },
    });
  });

  it("DELETE denies technicians with the lease-delete copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await DELETE(new Request("http://localhost/api/leases/lease-1"), { params });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att ta bort avtal");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });
});
