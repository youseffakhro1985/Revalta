import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, workOrderFindManyMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findMany: workOrderFindManyMock },
  },
}));

import { GET } from "./route";

describe("GET /api/work-orders/attestation-queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workOrderFindManyMock.mockResolvedValue([]);
  });

  it("denies technicians from reading the attestation queue", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(workOrderFindManyMock).not.toHaveBeenCalled();
  });

  it("scopes the queue to the manager's company and only submitted rows", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-1", company_id: "company-1", role: "manager" });
    workOrderFindManyMock.mockResolvedValue([{
      id: "wo-1",
      title: "Byte av cirkulationspump",
      status: "completed",
      updated_at: new Date("2026-09-14T12:00:00.000Z"),
      completed_at: new Date("2026-09-14T11:00:00.000Z"),
      property: { id: "prop-1", name: "Storgatan 12" },
      time_entries: [{ id: "t-1" }, { id: "t-2" }],
      material_entries: [{ id: "m-1" }],
    }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(workOrderFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-1",
        deleted_at: null,
      }),
    }));
    expect(body.summary).toEqual({ workOrders: 1, pendingTime: 2, pendingMaterial: 1 });
    expect(body.workOrders[0]).toEqual(expect.objectContaining({
      id: "wo-1",
      statusLabel: "Klar",
      pendingTime: 2,
      pendingMaterial: 1,
      href: "/dashboard/arbetsorder/wo-1#ekonomi",
    }));
    expect(JSON.stringify(workOrderFindManyMock.mock.calls[0]?.[0])).toContain("submitted");
  });

  it("returns an empty queue without leaking other tenants", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-2", company_id: "company-2", role: "owner" });
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.workOrders).toEqual([]);
    expect(workOrderFindManyMock.mock.calls[0]?.[0].where.company_id).toBe("company-2");
  });
});
