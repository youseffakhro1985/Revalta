import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  managedCountMock,
  managedGroupByMock,
  managedFindManyMock,
  propertyFindManyMock,
  leaseFindManyMock,
  loggerInfoMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  managedCountMock: vi.fn(),
  managedGroupByMock: vi.fn(),
  managedFindManyMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  leaseFindManyMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canViewLeasingData: (role: string) => role === "owner" || role === "admin" || role === "manager",
  tenantWhere: (user: { company_id: string | null }) => ({ company_id: user.company_id }),
}));

vi.mock("@/lib/db", () => ({
  default: {
    managedDocument: {
      count: managedCountMock,
      groupBy: managedGroupByMock,
      findMany: managedFindManyMock,
    },
    property: { findMany: propertyFindManyMock },
    lease: { findMany: leaseFindManyMock },
  },
}));

vi.mock("@/lib/route-observability", () => ({
  createRouteObservability: () => ({
    requestId: "req-document-library",
    elapsed: (context: Record<string, unknown>) => context,
    correlate: (response: Response) => response,
    logger: {
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: vi.fn(),
      error: loggerErrorMock,
    },
  }),
}));

import { GET } from "./route";

const emptyGroups = [[], [], []] as const;

function modernRow(id = "doc-1") {
  return {
    id,
    property_id: null,
    unit_id: null,
    lease_id: null,
    name: "Serviceavtal",
    category: "contract",
    visibility: "internal",
    valid_until: null,
    file_name: "serviceavtal.pdf",
    content_type: "application/pdf",
    size_bytes: 1234,
    lifecycle_state: "active",
    created_at: new Date("2026-09-01T10:00:00.000Z"),
    updated_at: new Date("2026-09-01T10:00:00.000Z"),
    created_by: { name: "Manager", email: "manager@example.com" },
  };
}

function primeBaseData() {
  managedCountMock
    .mockResolvedValueOnce(60)
    .mockResolvedValueOnce(80)
    .mockResolvedValueOnce(10)
    .mockResolvedValueOnce(3);
  managedGroupByMock
    .mockResolvedValueOnce(emptyGroups[0])
    .mockResolvedValueOnce(emptyGroups[1])
    .mockResolvedValueOnce(emptyGroups[2]);
  propertyFindManyMock.mockResolvedValue([]);
  leaseFindManyMock.mockResolvedValue([]);
  managedFindManyMock
    .mockResolvedValueOnce([modernRow()])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);
}

describe("documents/library GET — tenant and pagination contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("REVALTA_MODERN_STORAGE_ONLY", "1");
  });

  it("returns 401 before any document query when the request is unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const response = await GET(new Request("https://www.revalta.se/api/documents/library"));
    expect(response.status).toBe(401);
    expect(managedCountMock).not.toHaveBeenCalled();
    expect(managedFindManyMock).not.toHaveBeenCalled();
    expect(propertyFindManyMock).not.toHaveBeenCalled();
  });

  it("fails closed when an authenticated user has no company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", role: "manager", company_id: null });
    const response = await GET(new Request("https://www.revalta.se/api/documents/library"));
    expect(response.status).toBe(400);
    expect(managedCountMock).not.toHaveBeenCalled();
    expect(managedFindManyMock).not.toHaveBeenCalled();
  });

  it("scopes every document query to the session company and applies bounded server pagination", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-a", role: "viewer", company_id: "company-a" });
    primeBaseData();
    const response = await GET(new Request("https://www.revalta.se/api/documents/library?page=3&pageSize=25&search=avtal&category=contract&visibility=internal&lifecycle=active&sort=name&focus=internal"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.pagination).toEqual({ page: 3, pageSize: 25, total: 60, totalPages: 3 });
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0]).toEqual(expect.objectContaining({ id: "doc-1", source: "table" }));
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    for (const call of managedCountMock.mock.calls) expect(call[0]?.where).toEqual(expect.objectContaining({ company_id: "company-a" }));
    for (const call of managedGroupByMock.mock.calls) expect(call[0]?.where).toEqual(expect.objectContaining({ company_id: "company-a" }));
    for (const call of managedFindManyMock.mock.calls) expect(call[0]?.where).toEqual(expect.objectContaining({ company_id: "company-a" }));
    expect(managedFindManyMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ skip: 50, take: 25, orderBy: [{ name: "asc" }, { created_at: "desc" }] }));
    expect(propertyFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ company_id: "company-a", deleted_at: null }) }));
    expect(leaseFindManyMock).not.toHaveBeenCalled();
  });

  it("clamps pageSize to 100 and never loads another company's leases", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-a", role: "owner", company_id: "company-a" });
    managedCountMock.mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    managedGroupByMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    propertyFindManyMock.mockResolvedValue([]);
    leaseFindManyMock.mockResolvedValue([]);
    managedFindManyMock.mockResolvedValueOnce([modernRow()]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const response = await GET(new Request("https://www.revalta.se/api/documents/library?pageSize=99999"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.pagination.pageSize).toBe(100);
    expect(managedFindManyMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ skip: 0, take: 100 }));
    expect(leaseFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ company_id: "company-a", deleted_at: null }), take: 2000 }));
  });
});
