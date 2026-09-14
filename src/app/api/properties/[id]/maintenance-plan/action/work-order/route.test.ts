import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  propertyFindFirstMock,
  actionFindFirstMock,
  writeAuditLogMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  actionFindFirstMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  transactionMock: vi.fn(),
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
    property: { findFirst: propertyFindFirstMock },
    maintenanceAction: { findFirst: actionFindFirstMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/work-order-enterprise-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/work-order-enterprise-core")>()),
  allocateWorkOrderNumber: vi.fn().mockResolvedValue("AO-2026-000001"),
  setWorkOrderEnterpriseFields: vi.fn().mockResolvedValue(undefined),
  addWorkOrderStatusEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/work-order-asset-links", () => ({
  setWorkOrderAssetLinks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@prisma/client", () => ({
  Prisma: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }) },
}));

import { POST } from "./route";
import { setWorkOrderEnterpriseFields } from "@/lib/work-order-enterprise-core";
import { setWorkOrderAssetLinks } from "@/lib/work-order-asset-links";

const owner = { id: "user-1", company_id: "company-1", role: "owner" };
const property = { id: "property-1", name: "Kvarnhuset" };
const action = {
  id: "action-1",
  company_id: "company-1",
  property_id: "property-1",
  maintenance_plan_id: "plan-1",
  title: "Takbyte – intern titel",
  description: "Intern teknisk fritext",
  scope: "Södra takfallet",
  category: "Tak",
  planned_year: 2028,
  estimated_cost: 450000,
  priority: "high",
  status: "planned",
  contractor: "Tak AB",
  building_id: "building-1",
  technical_asset_id: null,
  source_work_order_id: null,
};

function request(body: Record<string, unknown> | string = { actionId: "action-1" }) {
  return new Request("https://www.revalta.se/api/properties/property-1/maintenance-plan/action/work-order", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function params(propertyId = "property-1") {
  return { params: Promise.resolve({ id: propertyId }) };
}

describe("maintenance-plan action work-order route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue(property);
    actionFindFirstMock.mockResolvedValue(action);
  });

  it("returns 401 without a session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const response = await POST(request(), params());
    expect(response.status).toBe(401);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 403 for viewers", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });
    const response = await POST(request(), params());
    expect(response.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the property is missing or soft-deleted", async () => {
    propertyFindFirstMock.mockResolvedValue(null);
    const response = await POST(request(), params());
    expect(response.status).toBe(404);
    expect(actionFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 409 without creating a work order for a completed action", async () => {
    actionFindFirstMock.mockResolvedValue({ ...action, status: "completed" });
    const response = await POST(request(), params());
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.error).toMatch(/avslutad/i);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the action is already linked", async () => {
    actionFindFirstMock.mockResolvedValue({ ...action, source_work_order_id: "work-order-existing" });
    const response = await POST(request(), params());
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.workOrderId).toBe("work-order-existing");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 409 without creating a work order when a concurrent request already holds the lock", async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ locked: false }]) };
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));

    const response = await POST(request(), params());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/försök igen/i);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("creates exactly one preventive work order, links it back and writes audit in the same transaction", async () => {
    const workOrderCreateMock = vi.fn().mockResolvedValue({ id: "work-order-new" });
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      maintenanceAction: {
        findFirst: vi.fn().mockResolvedValue({ source_work_order_id: null, status: "planned" }),
        updateMany: updateManyMock,
      },
      workOrder: { create: workOrderCreateMock },
    };
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));

    const response = await POST(request(), params());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(workOrderCreateMock).toHaveBeenCalledTimes(1);
    expect(workOrderCreateMock.mock.calls[0][0].data).toEqual(expect.objectContaining({
      company_id: "company-1",
      property_id: "property-1",
      status: "planned",
      priority: "high",
    }));
    expect(setWorkOrderEnterpriseFields).toHaveBeenCalledWith(tx, expect.objectContaining({
      workOrderId: "work-order-new",
      workType: "preventive",
      source: "maintenance_plan",
    }));
    expect(setWorkOrderAssetLinks).toHaveBeenCalledWith(tx, expect.objectContaining({
      workOrderId: "work-order-new",
      buildingId: "building-1",
      technicalAssetId: null,
    }));
    expect(updateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "action-1", company_id: "company-1", source_work_order_id: null }),
      data: expect.objectContaining({ source_work_order_id: "work-order-new", status: "in_progress" }),
    }));
    expect(body).toEqual(expect.objectContaining({ success: true, workOrderId: "work-order-new", workOrderNumber: "AO-2026-000001" }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", company_id: "company-1" }),
      expect.objectContaining({
        entityType: "maintenance_action",
        entityId: "action-1",
        action: "maintenance_action.work_order_created",
        metadata: expect.objectContaining({
          workOrderId: "work-order-new",
          propertyId: "property-1",
          planId: "plan-1",
          plannedYear: 2028,
        }),
      }),
      tx,
    );
    const audit = JSON.stringify(writeAuditLogMock.mock.calls[0][1].metadata);
    expect(audit).not.toContain("Takbyte");
    expect(audit).not.toContain("450000");
    expect(audit).not.toContain("Intern teknisk fritext");
  });

  it("returns 500 when mandatory audit fails inside the transaction", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      maintenanceAction: {
        findFirst: vi.fn().mockResolvedValue({ source_work_order_id: null, status: "planned" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      workOrder: { create: vi.fn().mockResolvedValue({ id: "work-order-new" }) },
    };
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));

    const response = await POST(request(), params());
    expect(response.status).toBe(500);
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx);
  });
});
