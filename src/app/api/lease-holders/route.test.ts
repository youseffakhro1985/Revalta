import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, propertyFindFirstMock, holderFindManyMock, holderCountMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  holderFindManyMock: vi.fn(),
  holderCountMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    leaseHolder: { findMany: holderFindManyMock, count: holderCountMock },
  },
}));

import { GET } from "./route";

describe("lease-holders GET pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
    holderFindManyMock.mockResolvedValue([]);
    holderCountMock.mockResolvedValue(61);
  });

  it("paginates and searches within the verified property and tenant", async () => {
    const response = await GET(new Request("https://www.revalta.se/api/lease-holders?propertyId=property-1&page=2&pageSize=25&search=Anna"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(propertyFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "property-1", company_id: "company-1", deleted_at: null },
    }));
    expect(holderFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      skip: 25,
      take: 25,
      orderBy: [{ status: "asc" }, { name: "asc" }, { id: "asc" }],
      where: expect.objectContaining({
        company_id: "company-1",
        leases: { some: { property_id: "property-1", deleted_at: null } },
        OR: expect.arrayContaining([{ name: { contains: "Anna", mode: "insensitive" } }]),
      }),
    }));
    expect(body.pagination).toEqual({ page: 2, pageSize: 25, total: 61, totalPages: 3 });
  });

  it("caps oversized pages at 100 rows", async () => {
    const response = await GET(new Request("https://www.revalta.se/api/lease-holders?pageSize=10000"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(holderFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
    expect(body.pagination.pageSize).toBe(100);
  });

  it("rejects an inaccessible property before reading contacts", async () => {
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await GET(new Request("https://www.revalta.se/api/lease-holders?propertyId=other-company-property"));

    expect(response.status).toBe(404);
    expect(holderFindManyMock).not.toHaveBeenCalled();
    expect(holderCountMock).not.toHaveBeenCalled();
  });
});
