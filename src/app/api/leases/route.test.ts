import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  leaseFindManyMock,
  leaseCountMock,
  leaseAggregateMock,
  leaseGroupByMock,
  propertyFindManyMock,
  leaseHolderFindManyMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  leaseFindManyMock: vi.fn(),
  leaseCountMock: vi.fn(),
  leaseAggregateMock: vi.fn(),
  leaseGroupByMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  leaseHolderFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    lease: { findMany: leaseFindManyMock, count: leaseCountMock, aggregate: leaseAggregateMock, groupBy: leaseGroupByMock },
    property: { findMany: propertyFindManyMock },
    leaseHolder: { findMany: leaseHolderFindManyMock },
  },
}));

import { GET } from "./route";

describe("leases route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaseFindManyMock.mockResolvedValue([]);
    leaseCountMock.mockResolvedValue(0);
    leaseAggregateMock.mockResolvedValue({ _sum: { monthly_rent: null } });
    leaseGroupByMock.mockResolvedValue([]);
    propertyFindManyMock.mockResolvedValue([]);
    leaseHolderFindManyMock.mockResolvedValue([]);
  });

  it("GET scopes leases to active properties", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });

    const response = await GET(new Request("https://www.revalta.se/api/leases"));
    expect(response.status).toBe(200);
    expect(leaseFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
    }));
  });

  it("GET returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const response = await GET(new Request("https://www.revalta.se/api/leases"));
    expect(response.status).toBe(401);
    expect(leaseFindManyMock).not.toHaveBeenCalled();
  });

  it("GET denies technicians from reading leasing data", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(new Request("https://www.revalta.se/api/leases"));
    expect(response.status).toBe(403);
    expect(leaseFindManyMock).not.toHaveBeenCalled();
  });

  it("GET allows viewers to read leasing data", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });
    const response = await GET(new Request("https://www.revalta.se/api/leases"));
    expect(response.status).toBe(200);
    expect(leaseFindManyMock).toHaveBeenCalled();
  });

  it("paginates history while fetching occupancy separately", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    leaseCountMock.mockResolvedValue(125);
    leaseAggregateMock.mockResolvedValue({ _sum: { monthly_rent: 50_000 } });
    leaseGroupByMock.mockResolvedValue([{ lease_holder_id: "holder-1" }, { lease_holder_id: "holder-2" }]);

    const response = await GET(new Request("https://www.revalta.se/api/leases?page=2&pageSize=25"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(leaseFindManyMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ skip: 25, take: 25 }));
    expect(leaseFindManyMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ status: { in: ["reserved", "active", "notice"] } }),
    }));
    expect(body.pagination).toEqual({ page: 2, pageSize: 25, total: 125, totalPages: 5 });
    expect(body.summary).toEqual({ activeHolders: 2, annualRent: 600_000 });
  });
});
