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
  ticketFindFirstMock,
  notifyTicketReporterMock,
  hasVendorColumnMock,
  vendorFindFirstMock,
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
  ticketFindFirstMock: vi.fn(),
  notifyTicketReporterMock: vi.fn(),
  hasVendorColumnMock: vi.fn(),
  vendorFindFirstMock: vi.fn(),
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
vi.mock("@/lib/ticket-reporter-notify", () => ({ notifyTicketReporter: notifyTicketReporterMock }));
vi.mock("@/lib/vendor-notify", () => ({ notifyVendor: vi.fn().mockResolvedValue({ emailed: false }) }));
vi.mock("@/lib/assignee-notify", () => ({ notifyAssignee: vi.fn().mockResolvedValue({ emailed: false }) }));

vi.mock("@/lib/schema-readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema-readiness")>()),
  hasWorkOrderVendorContractColumn: hasVendorColumnMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock },
    ticket: { findFirst: ticketFindFirstMock },
    user: { findFirst: vi.fn(), findMany: vi.fn() },
    vendorContract: { findFirst: vendorFindFirstMock, findMany: vi.fn().mockResolvedValue([]) },
    $transaction: transactionMock,
  },
}));

import { DELETE, PATCH } from "./route";
import { notifyAssignee } from "@/lib/assignee-notify";

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
  updated_at: new Date("2026-09-01T09:00:00.000Z"),
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
  $queryRaw: vi.fn(),
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

function patchRequest(body: Record<string, unknown> = { title: "Ny rubrik" }) {
  return new Request("https://www.revalta.se/api/work-orders/wo-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      editToken: "lock-token",
      version: existing.updated_at.toISOString(),
      ...body,
    }),
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
    notifyTicketReporterMock.mockResolvedValue({ emailed: true, sms: true });
    ticketFindFirstMock.mockResolvedValue(null);
    hasVendorColumnMock.mockResolvedValue(false);
    vendorFindFirstMock.mockResolvedValue({ id: "vendor-1", name: "Städ AB", category: "Städ" });
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    (tx.$queryRaw as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ updated_at: existing.updated_at }])
      .mockResolvedValueOnce([{ token_hash: "held" }]);
  });

  it("keeps PATCH mutation, final state reads and mandatory audit in the same transaction", async () => {
    const response = await PATCH(patchRequest(), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(workOrderUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        deleted_at: null,
        id: "wo-1",
        company_id: "company-1",
        updated_at: existing.updated_at,
      },
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

  it("rejects PATCH without an edit lock before opening a transaction", async () => {
    const response = await PATCH(new Request("https://www.revalta.se/api/work-orders/wo-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Ny rubrik" }),
    }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("lock_required");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects PATCH when the held lock version no longer matches inside the transaction", async () => {
    (tx.$queryRaw as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockResolvedValueOnce([{ updated_at: new Date("2026-09-01T10:00:00.000Z") }])
      .mockResolvedValueOnce([{ token_hash: "held" }]);

    const response = await PATCH(patchRequest(), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("version_conflict");
    expect(workOrderUpdateManyMock).not.toHaveBeenCalled();
  });

  it("notifies the linked ticket reporter after a work-order status sync", async () => {
    workOrderFindFirstMock.mockResolvedValue({ ...existing, ticket_id: "ticket-1" });
    ticketSyncMock.mockResolvedValue({ changed: true, status: "in_progress" });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckande kran",
      status: "in_progress",
      public_reference: "RV-12",
      reporter_email: "anna@example.se",
      reporter_phone: "0701234567",
    });

    const response = await PATCH(patchRequest({ status: "in_progress" }), params);

    expect(response.status).toBe(200);
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "ticket-1", company_id: "company-1", deleted_at: null },
    }));
    expect(notifyTicketReporterMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "owner-1" }),
      expect.objectContaining({ id: "ticket-1", reporter_email: "anna@example.se" }),
      "updated",
    );
  });

  it("emails the assignee when a work order is paused", async () => {
    txWorkOrderFindFirstMock.mockResolvedValue({
      ...updated,
      status: "waiting_material",
      assigned_to: { id: "tech-1", name: "Tekniker", email: "tech@example.se" },
    });

    const response = await PATCH(patchRequest({ status: "waiting_material" }), params);

    expect(response.status).toBe(200);
    expect(notifyAssignee).toHaveBeenCalledWith(
      expect.objectContaining({ id: "owner-1", company_id: "company-1" }),
      expect.objectContaining({
        id: "wo-1",
        kind: "work_order",
        notifyKind: "paused",
        pauseLabel: "Väntar material",
        assigneeId: "tech-1",
        assigneeEmail: "tech@example.se",
      }),
    );
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

  it("persists a tenant-scoped vendor on PATCH when the column is released", async () => {
    hasVendorColumnMock.mockResolvedValue(true);

    const response = await PATCH(patchRequest({ vendorContractId: "vendor-1" }), params);

    expect(response.status).toBe(200);
    expect(vendorFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: "vendor-1",
        company_id: "company-1",
        status: "active",
        OR: [{ property_id: null }, { property_id: "property-1" }],
      },
      select: { id: true, name: true, category: true, email: true },
    });
    expect(workOrderUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ vendor_contract_id: "vendor-1" }),
    }));
  });

  it("rejects a vendor outside the work order property on PATCH", async () => {
    hasVendorColumnMock.mockResolvedValue(true);
    vendorFindFirstMock.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ vendorContractId: "foreign-vendor" }), params);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Leverantören hittades inte");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 503 when PATCH tries to set a vendor before Database Release", async () => {
    const response = await PATCH(patchRequest({ vendorContractId: "vendor-1" }), params);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/Database Release/);
    expect(transactionMock).not.toHaveBeenCalled();
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
