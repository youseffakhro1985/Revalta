import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  itemFindManyMock,
  itemFindFirstMock,
  itemCreateMock,
  itemUpdateManyMock,
  auditFindManyMock,
  propertyFindManyMock,
  propertyFindFirstMock,
  workOrderFindFirstMock,
  queryRawMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  itemFindFirstMock: vi.fn(),
  itemCreateMock: vi.fn(),
  itemUpdateManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  queryRawMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

const tx = {
  portfolioMaintenanceItem: {
    create: itemCreateMock,
    updateMany: itemUpdateManyMock,
  },
};

vi.mock("@/lib/db", () => ({
  default: {
    portfolioMaintenanceItem: {
      findMany: itemFindManyMock,
      findFirst: itemFindFirstMock,
      updateMany: itemUpdateManyMock,
      create: itemCreateMock,
    },
    auditLog: { findMany: auditFindManyMock, findFirst: vi.fn() },
    property: { findMany: propertyFindManyMock, findFirst: propertyFindFirstMock },
    workOrder: { findFirst: workOrderFindFirstMock },
    $queryRaw: queryRawMock,
    $transaction: transactionMock,
  },
}));

import { GET, PATCH, POST } from "./route";

describe("maintenance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    itemFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    propertyFindManyMock.mockResolvedValue([]);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Storgatan 1" });
    itemCreateMock.mockResolvedValue({ id: "item-new" });
    itemUpdateManyMock.mockResolvedValue({ count: 1 });
    queryRawMock.mockResolvedValue([{ work_order_number: "AO-0001" }]);
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("redacts estimated cost for technicians on GET", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    itemFindManyMock.mockResolvedValue([{
      id: "item-1",
      property_id: "property-1",
      property: { name: "Storgatan 1" },
      component: "Tak",
      measure: "Omläggning",
      planned_year: 2027,
      estimated_cost: 100000,
      priority: "normal",
      interval_years: 30,
      status: "planned",
      work_order_id: null,
      work_order_number: null,
      created_at: new Date(),
      updated_at: new Date(),
    }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items[0].estimated_cost).toBeNull();
    expect(body.permissions.canViewFinance).toBe(false);
    expect(body.permissions.canManage).toBe(false);
  });

  it("creates a modern maintenance item and mandatory audit in the same transaction", async () => {
    const user = { id: "owner-1", company_id: "company-1", role: "owner" };
    getCurrentUserMock.mockResolvedValue(user);

    const response = await POST(new Request("http://localhost/api/maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: "property-1",
        component: "Tak",
        measure: "Omläggning",
        plannedYear: 2028,
        estimatedCost: 120000,
        priority: "high",
        intervalYears: 25,
      }),
    }));

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(itemCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        property_id: "property-1",
        component: "Tak",
        planned_year: 2028,
        estimated_cost: 120000,
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        entityType: "property",
        entityId: "property-1",
        action: "maintenance.plan.item",
        metadata: expect.objectContaining({ item_id: "item-new", storage: "PortfolioMaintenanceItem" }),
      }),
      tx,
    );
  });

  it("returns 500 when mandatory create audit fails inside the transaction", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    const response = await POST(new Request("http://localhost/api/maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: "property-1",
        component: "Tak",
        measure: "Omläggning",
        plannedYear: 2028,
        estimatedCost: 120000,
        priority: "high",
        intervalYears: 25,
      }),
    }));

    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(itemCreateMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx);
  });

  it("denies technician cost mutations on PATCH", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
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
      body: JSON.stringify({ itemId: "item-1", estimatedCost: 120000 }),
    }));

    expect(response.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(itemUpdateManyMock).not.toHaveBeenCalled();
  });

  it("updates modern maintenance item with active property filter and audit in the same transaction", async () => {
    const user = { id: "user-1", company_id: "company-1", role: "owner" };
    getCurrentUserMock.mockResolvedValue(user);
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
    expect(transactionMock).toHaveBeenCalledTimes(1);
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
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ action: "maintenance.plan.item.updated" }),
      tx,
    );
  });

  it("returns 500 when mandatory update audit fails inside the transaction", async () => {
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
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    const response = await PATCH(new Request("http://localhost/api/maintenance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: "item-1", status: "approved" }),
    }));

    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(itemUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx);
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
    expect(transactionMock).not.toHaveBeenCalled();
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
    expect(transactionMock).not.toHaveBeenCalled();
    expect(itemUpdateManyMock).not.toHaveBeenCalled();
  });
});
