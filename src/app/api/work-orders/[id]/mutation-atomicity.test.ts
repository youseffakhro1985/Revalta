import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  workOrderUpdateManyMock,
  txWorkOrderFindFirstMock,
  transactionMock,
  getEnterpriseMock,
  getStatusEventsMock,
  getAssetLinkMock,
  ticketSyncMock,
  componentSyncMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  workOrderUpdateManyMock: vi.fn(),
  txWorkOrderFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
  getEnterpriseMock: vi.fn(),
  getStatusEventsMock: vi.fn(),
  getAssetLinkMock: vi.fn(),
  ticketSyncMock: vi.fn(),
  componentSyncMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/work-order-enterprise-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/work-order-enterprise-core")>()),
  getWorkOrderEnterpriseState: getEnterpriseMock,
  getWorkOrderStatusEvents: getStatusEventsMock,
}));

vi.mock("@/lib/work-order-asset-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/work-order-asset-links")>()),
  getWorkOrderAssetLink: getAssetLinkMock,
}));

vi.mock("@/lib/work-order-ticket-sync", () => ({ syncWorkOrderToTicket: ticketSyncMock }));
vi.mock("@/lib/component-work-order-sync", () => ({ syncCompletedWorkOrderToComponent: componentSyncMock }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock },
    user: { findFirst: vi.fn(), findMany: vi.fn() },
    $transaction: transactionMock,
  },
}));

import { DELETE, PATCH } from "./route";

const params = { params: Promise.resolve({ id: "wo-1" }) };

const existing = {
  id: "wo-1",
  ticket_id: null,
  property_id: "property-1",
  assigned_to_id: "tech-1",
  title: "Gamla rubriken",
  description: "Beskrivning",
  status: "planned",
  priority: "normal",
  actual_cost: null,
  scheduled_start: null,
  scheduled_end: null,
  completed_at: null,
  created_at: new Date("2026-09-01T08:00:00.000Z"),
};

const updated = {
  ...existing,
  title: "Ny rubrik",
  estimated_cost: null,
  actual_cost: null,
  property: { id: "property-1", name: "Fastigheten", address: "Storgatan 1", city: "Göteborg" },
  unit: null,
  ticket: null,
  assigned_to: null,
  created_by: null,
  projects: [],
  comments: [],
};

const tx = {
  workOrder: {
    updateMany: workOrderUpdateManyMock,
    findFirst: txWorkOrderFindFirstMock,
  },
  $executeRaw: vi.fn(),
};

function ownerUser() {
  return {
    id: "owner-1",
    email: "owner@example.com",
    name: "Owner",
    company_id: "company-1",
    role: "owner",
  };
}

function patchRequest() {
  return new Request("https://www.revalta.se/api/work-orders/wo-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Ny rubrik" }),
  });
}

describe("core work-order mutation atomicity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(ownerUser());
    workOrderFindFirstMock.mockResolvedValue(existing);
    workOrderUpdateManyMock.mockResolvedValue({ count: 1 });
    txWorkOrderFindFirstMock.mockResolvedValue(updated);
    getEnterpriseMock.mockResolvedValue({ work_order_number: "AO-100", work_type: "corrective" });
    getStatusEventsMock.mockResolvedValue([]);
    getAssetLinkMock.mockResolvedValue({ building_id: null, technical_asset_id: null });
    ticketSyncMock.mockResolvedValue(null);
    componentSyncMock.mockResolvedValue(null);
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("keeps PATCH mutation, final state reads and mandatory audit in the same transaction", async () => {
    const response = await PATCH(patchRequest(), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(workOrderUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { deleted_at: null, id: "wo-1", company_id: "company-1" },
      data: expect.objectContaining({ title: "Ny rubrik" }),
    }));
    expect(getEnterpriseMock).toHaveBeenLastCalledWith(tx, "company-1", "wo-1");
    expect(getStatusEventsMock).toHaveBeenCalledWith(tx, "company-1", "wo-1");
    expect(getAssetLinkMock).toHaveBeenLastCalledWith(tx, "company-1", "wo-1");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "owner-1", company_id: "company-1" }),
      expect.objectContaining({ entityType: "work_order", entityId: "wo-1", action: "work_order.updated" }),
      tx,
    );
    expect(body.workOrder.title).toBe("Ny rubrik");
  });

  it("does not report PATCH success when the mandatory audit write fails", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    await expect(PATCH(patchRequest(), params)).rejects.toThrow("audit unavailable");

    expect(workOrderUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "work_order.updated" }),
      tx,
    );
  });

  it("soft-deletes a work order and writes its audit record through one transaction", async () => {
    workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", title: "Arbetsorder", status: "planned", assigned_to_id: null });

    const response = await DELETE(new Request("https://www.revalta.se/api/work-orders/wo-1", { method: "DELETE" }), params);

    expect(response.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(workOrderUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "wo-1", company_id: "company-1", deleted_at: null },
      data: { deleted_at: expect.any(Date) },
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "owner-1", company_id: "company-1" }),
      expect.objectContaining({ entityType: "work_order", entityId: "wo-1", action: "work_order.deleted" }),
      tx,
    );
  });

  it("does not report DELETE success when audit persistence fails", async () => {
    workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", title: "Arbetsorder", status: "planned", assigned_to_id: null });
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    await expect(DELETE(new Request("https://www.revalta.se/api/work-orders/wo-1", { method: "DELETE" }), params)).rejects.toThrow("audit unavailable");

    expect(workOrderUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "work_order.deleted" }),
      tx,
    );
  });
});
