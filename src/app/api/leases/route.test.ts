import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  leaseFindManyMock,
  propertyFindManyMock,
  leaseHolderFindManyMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  leaseFindManyMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  leaseHolderFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    lease: { findMany: leaseFindManyMock },
    property: { findMany: propertyFindManyMock },
    leaseHolder: { findMany: leaseHolderFindManyMock },
  },
}));

import { GET } from "./route";

describe("leases route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaseFindManyMock.mockResolvedValue([]);
    propertyFindManyMock.mockResolvedValue([]);
    leaseHolderFindManyMock.mockResolvedValue([]);
  });

  it("GET scopes leases to active properties", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(leaseFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
    }));
  });

  it("GET returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(leaseFindManyMock).not.toHaveBeenCalled();
  });
});
