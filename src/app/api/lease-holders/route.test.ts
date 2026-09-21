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

import { GET, POST } from "./route";

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

  it("denies technicians from listing lease holders", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(new Request("https://www.revalta.se/api/lease-holders"));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa hyresparter");
    expect(holderFindManyMock).not.toHaveBeenCalled();
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing holder emails", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET(new Request("https://www.revalta.se/api/lease-holders"));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(holderFindManyMock).not.toHaveBeenCalled();
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
  });

  it("rejects an inaccessible property before reading contacts", async () => {
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await GET(new Request("https://www.revalta.se/api/lease-holders?propertyId=other-company-property"));

    expect(response.status).toBe(404);
    expect(holderFindManyMock).not.toHaveBeenCalled();
    expect(holderCountMock).not.toHaveBeenCalled();
  });

  it("POST denies residents before creating a holder", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await POST(new Request("https://www.revalta.se/api/lease-holders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Anna Andersson" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
  });

  it("POST denies technicians with the holder-manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await POST(new Request("https://www.revalta.se/api/lease-holders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Anna Andersson" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att hantera kontaktregistret");
  });
});
