import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  projectFindManyMock,
  projectCountMock,
  projectAggregateMock,
  propertyFindManyMock,
  userFindManyMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  projectFindManyMock: vi.fn(),
  projectCountMock: vi.fn(),
  projectAggregateMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  userFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    project: {
      findMany: projectFindManyMock,
      count: projectCountMock,
      aggregate: projectAggregateMock,
    },
    property: { findMany: propertyFindManyMock },
    user: { findMany: userFindManyMock },
  },
}));

import { GET } from "./route";

describe("projects GET pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    projectFindManyMock.mockResolvedValue([]);
    projectCountMock.mockResolvedValueOnce(120).mockResolvedValueOnce(7);
    projectAggregateMock.mockResolvedValue({ _sum: { budget: 1_000_000, forecast: 900_000, actual: 400_000 } });
    propertyFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([]);
  });

  it("returns a stable tenant page with global portfolio totals", async () => {
    const response = await GET(new Request("https://www.revalta.se/api/projects?page=2&pageSize=25"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(projectFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      skip: 25,
      take: 25,
      where: expect.objectContaining({ company_id: "company-1", deleted_at: null }),
      orderBy: expect.arrayContaining([{ id: "asc" }]),
    }));
    expect(body.pagination).toEqual({ page: 2, pageSize: 25, total: 120, totalPages: 5 });
    expect(body.summary).toEqual({ active: 7, budget: 1_000_000, forecast: 900_000, actual: 400_000 });
  });

  it("caps oversized pages at 100 rows", async () => {
    const response = await GET(new Request("https://www.revalta.se/api/projects?page=1&pageSize=5000"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(projectFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
    expect(body.pagination.pageSize).toBe(100);
  });
});
