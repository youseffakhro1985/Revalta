import { beforeEach, describe, expect, it, vi } from "vitest";

const { findAccessibleWorkOrderMock, getCurrentUserMock, queryRawMock } = vi.hoisted(() => ({
  findAccessibleWorkOrderMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  queryRawMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({ getCurrentUser: getCurrentUserMock }));
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
});
