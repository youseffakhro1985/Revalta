import { beforeEach, describe, expect, it, vi } from "vitest";

const { findAccessibleWorkOrderMock, getCurrentUserMock, queryRawMock } = vi.hoisted(() => ({
  findAccessibleWorkOrderMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  queryRawMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  requireCompanyUser: (user: { company_id: string | null; role?: string } | null) => {
    if (!user?.company_id) return null;
    if (!["owner", "admin", "manager", "technician", "viewer"].includes(user.role || "")) return null;
    return user;
  },
}));
vi.mock("@/lib/db", () => ({ default: { $queryRaw: queryRawMock } }));
vi.mock("@/lib/assigned-work-access", () => ({
  findAccessibleWorkOrder: findAccessibleWorkOrderMock,
  notFoundWorkOrder: () => Response.json({ error: "Arbetsordern hittades inte" }, { status: 404 }),
}));

import { GET } from "./route";

describe("GET /api/work-order-reports/[reportId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hides a report when its work order is outside technician assignment scope", async () => {
    const user = { id: "technician-1", role: "technician", company_id: "company-1" };
    getCurrentUserMock.mockResolvedValue(user);
    queryRawMock.mockResolvedValue([{ id: "report-1", work_order_id: "work-order-2" }]);
    findAccessibleWorkOrderMock.mockResolvedValue(null);

    const response = await GET(
      new Request("https://www.revalta.se/api/work-order-reports/report-1"),
      { params: Promise.resolve({ reportId: "report-1" }) },
    );

    expect(response.status).toBe(404);
    expect(findAccessibleWorkOrderMock).toHaveBeenCalledWith(user, "work-order-2");
  });

  it("rejects residents before reading work-order report snapshots", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await GET(
      new Request("https://www.revalta.se/api/work-order-reports/report-1"),
      { params: Promise.resolve({ reportId: "report-1" }) },
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(findAccessibleWorkOrderMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A reads a Tenant B report id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    queryRawMock.mockResolvedValue([]);

    const response = await GET(
      new Request("https://www.revalta.se/api/work-order-reports/report-tenant-b"),
      { params: Promise.resolve({ reportId: "report-tenant-b" }) },
    );
    const body = await response.json();
    const sql = JSON.stringify(queryRawMock.mock.calls[0]?.[0] ?? {});

    expect(response.status).toBe(404);
    expect(body.error).toBe("Rapporten hittades inte");
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(sql).toContain("report-tenant-b");
    expect(sql).toContain("company-1");
    expect(findAccessibleWorkOrderMock).not.toHaveBeenCalled();
  });
});
