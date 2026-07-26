import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  itemFindManyMock,
  itemFindFirstMock,
  itemUpdateManyMock,
  auditFindManyMock,
  propertyFindManyMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  itemFindFirstMock: vi.fn(),
  itemUpdateManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
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
    portfolioMaintenanceItem: {
      findMany: itemFindManyMock,
      findFirst: itemFindFirstMock,
      updateMany: itemUpdateManyMock,
      create: vi.fn(),
    },
    auditLog: { findMany: auditFindManyMock, findFirst: vi.fn() },
    property: { findMany: propertyFindManyMock, findFirst: vi.fn() },
    workOrder: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { PATCH } from "./route";

describe("maintenance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    itemFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    propertyFindManyMock.mockResolvedValue([]);
    itemUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("updates modern maintenance item with active property filter", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    itemFindFirstMock.mockResolvedValue({
      id: "item-1",
      property_id: "property-1",
      component: "Tak",
      measure: "Omläggning",
      planned_year: 2027,
      estimated_cost: 100000,
      priority: "normal",
      interval_years: 30,
      status: "planned",
      work_order_id: null,
      work_order_number: null,
    });

    const response = await PATCH(new Request("http://localhost/api/maintenance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: "item-1",
        status: "approved",
        component: "Tak",
        measure: "Omläggning uppdaterad",
        plannedYear: 2028,
        estimatedCost: 120000,
        priority: "high",
        intervalYears: 25,
      }),
    }));

    expect(response.status).toBe(200);
    expect(itemFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "item-1", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(itemUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "item-1", company_id: "company-1" },
      data: expect.objectContaining({
        status: "approved",
        measure: "Omläggning uppdaterad",
        planned_year: 2028,
        estimated_cost: 120000,
        priority: "high",
        interval_years: 25,
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "maintenance.plan.item.updated",
    }));
  });

  it("returns 404 when maintenance item belongs to a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    itemFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "item-1" });

    const response = await PATCH(new Request("http://localhost/api/maintenance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: "item-1", status: "approved" }),
    }));

    expect(response.status).toBe(404);
    expect(itemUpdateManyMock).not.toHaveBeenCalled();
  });

  it("fail-closes legacy maintenance updates with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    itemFindFirstMock.mockResolvedValue(null);
    auditFindManyMock.mockResolvedValue([
      { id: "legacy-1", metadata: { item_id: "legacy-1", component: "Fasade" } },
    ]);

    const response = await PATCH(new Request("http://localhost/api/maintenance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: "legacy-1", status: "approved" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(itemUpdateManyMock).not.toHaveBeenCalled();
  });
});
