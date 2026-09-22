import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  userFindManyMock,
  transactionMock,
  getWorkOrderEnterpriseStateMock,
  getWorkOrderStatusEventsMock,
  getWorkOrderAssetLinkMock,
  validateWorkOrderAssetLinksMock,
  getLatestInvoiceDraftMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  userFindManyMock: vi.fn(),
  transactionMock: vi.fn(),
  getWorkOrderEnterpriseStateMock: vi.fn(),
  getWorkOrderStatusEventsMock: vi.fn(),
  getWorkOrderAssetLinkMock: vi.fn(),
  validateWorkOrderAssetLinksMock: vi.fn(),
  getLatestInvoiceDraftMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/work-order-enterprise-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/work-order-enterprise-core")>()),
  getWorkOrderEnterpriseState: getWorkOrderEnterpriseStateMock,
  getWorkOrderStatusEvents: getWorkOrderStatusEventsMock,
}));

vi.mock("@/lib/work-order-asset-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/work-order-asset-links")>()),
  getWorkOrderAssetLink: getWorkOrderAssetLinkMock,
  validateWorkOrderAssetLinks: validateWorkOrderAssetLinksMock,
}));

vi.mock("@/lib/schema-readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema-readiness")>()),
  hasWorkOrderVendorContractColumn: vi.fn(async () => false),
}));

vi.mock("@/lib/work-order-ops-storage", () => ({
  getLatestInvoiceDraft: getLatestInvoiceDraftMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock, updateMany: vi.fn() },
    user: { findMany: userFindManyMock, findFirst: vi.fn() },
    vendorContract: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    $transaction: transactionMock,
  },
}));

import { GET, PATCH, DELETE } from "./route";
import { Prisma } from "@prisma/client";
import { schemaMismatchUserMessage } from "@/lib/schema-readiness";

const params = Promise.resolve({ id: "wo-1" });

function workOrderForPatch(status: string) {
  return {
    id: "wo-1",
    assigned_to_id: "tech-1",
    ticket_id: null,
    status,
    priority: "normal",
    scheduled_start: null,
    scheduled_end: null,
    property_id: "property-1",
    estimated_cost: null,
    actual_cost: null,
    completed_at: status === "completed" || status === "invoiced" ? new Date("2026-08-31T12:00:00Z") : null,
    created_at: new Date("2026-08-30T12:00:00Z"),
  };
}

describe("work-orders/[id] finance gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindManyMock.mockResolvedValue([]);
    getWorkOrderEnterpriseStateMock.mockResolvedValue(null);
    getWorkOrderStatusEventsMock.mockResolvedValue([]);
    getWorkOrderAssetLinkMock.mockResolvedValue({});
    validateWorkOrderAssetLinksMock.mockResolvedValue(undefined);
    getLatestInvoiceDraftMock.mockResolvedValue(null);
  });

  it("redacts costs for technicians on GET", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      company_id: "company-1",
      role: "technician",
    });
    workOrderFindFirstMock.mockResolvedValue({
      id: "wo-1",
      assigned_to_id: "tech-1",
      estimated_cost: 1200,
      actual_cost: 800,
    });

    const response = await GET(new Request("http://localhost/api/work-orders/wo-1"), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workOrder.estimated_cost).toBeNull();
    expect(body.workOrder.actual_cost).toBeNull();
    expect(body.canViewFinance).toBe(false);
    expect(body.canManageFinance).toBe(false);
  });

  it("denies technician cost mutations on PATCH", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      company_id: "company-1",
      role: "technician",
    });
    workOrderFindFirstMock.mockResolvedValue(workOrderForPatch("planned"));

    const response = await PATCH(new Request("http://localhost/api/work-orders/wo-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedCost: 500 }),
    }), { params });

    expect(response.status).toBe(403);
  });

  it("denies an assigned technician from marking a completed work order as invoiced", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      company_id: "company-1",
      role: "technician",
    });
    workOrderFindFirstMock.mockResolvedValue(workOrderForPatch("completed"));

    const response = await PATCH(new Request("http://localhost/api/work-orders/wo-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invoiced" }),
    }), { params });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/faktureringsstatus/i);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(getLatestInvoiceDraftMock).not.toHaveBeenCalled();
  });

  it("denies an assigned technician from reverting an invoiced work order to completed", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      company_id: "company-1",
      role: "technician",
    });
    workOrderFindFirstMock.mockResolvedValue(workOrderForPatch("invoiced"));

    const response = await PATCH(new Request("http://localhost/api/work-orders/wo-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    }), { params });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/faktureringsstatus/i);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects invoicing a completed work order without a ready invoice draft", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });
    workOrderFindFirstMock.mockResolvedValue(workOrderForPatch("completed"));
    getLatestInvoiceDraftMock.mockResolvedValue({ status: "draft", customerName: "Kund AB" });

    const response = await PATCH(new Request("http://localhost/api/work-orders/wo-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invoiced" }),
    }), { params });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("invoice_draft_not_ready");
    expect(body.error).toMatch(/fakturaunderlaget som klart/i);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects invoicing when no invoice draft exists", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });
    workOrderFindFirstMock.mockResolvedValue(workOrderForPatch("completed"));

    const response = await PATCH(new Request("http://localhost/api/work-orders/wo-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invoiced" }),
    }), { params });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("invoice_draft_not_ready");
    expect(getLatestInvoiceDraftMock).toHaveBeenCalledWith("company-1", "wo-1");
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe("work-order detail staff scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
      status: "active",
    });
  });

  it("rejects resident GET before loading work orders or the company user roster", async () => {
    const response = await GET(new Request("http://localhost/api/work-orders/wo-1"), { params });
    expect(response.status).toBe(403);
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
    expect(userFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects resident PATCH and DELETE", async () => {
    const patch = await PATCH(new Request("http://localhost/api/work-orders/wo-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "in_progress" }),
    }), { params });
    const del = await DELETE(new Request("http://localhost/api/work-orders/wo-1", { method: "DELETE" }), { params });
    expect(patch.status).toBe(403);
    expect(del.status).toBe(403);
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
  });
});

describe("work-order detail asset-link related ids", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });
    workOrderFindFirstMock.mockResolvedValue(workOrderForPatch("planned"));
    getWorkOrderEnterpriseStateMock.mockResolvedValue(null);
    getWorkOrderStatusEventsMock.mockResolvedValue([]);
    getWorkOrderAssetLinkMock.mockResolvedValue({});
    getLatestInvoiceDraftMock.mockResolvedValue(null);
  });

  it("returns 404 when asset-link validation cannot re-read the property in the caller company", async () => {
    validateWorkOrderAssetLinksMock.mockRejectedValue(new Error("Fastigheten hittades inte"));

    const response = await PATCH(new Request("http://localhost/api/work-orders/wo-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buildingId: "building-1" }),
    }), { params });

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Fastigheten hittades inte");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("keeps building mismatches as field validation", async () => {
    validateWorkOrderAssetLinksMock.mockRejectedValue(new Error("Byggnaden tillhör inte vald fastighet"));

    const response = await PATCH(new Request("http://localhost/api/work-orders/wo-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buildingId: "foreign-building" }),
    }), { params });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Byggnaden tillhör inte vald fastighet");
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe("work-order locked-update schema gaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });
    workOrderFindFirstMock.mockResolvedValue({
      ...workOrderForPatch("planned"),
      updated_at: new Date("2026-08-30T12:00:00Z"),
    });
    getWorkOrderEnterpriseStateMock.mockResolvedValue(null);
    getWorkOrderAssetLinkMock.mockResolvedValue({});
    getLatestInvoiceDraftMock.mockResolvedValue(null);
  });

  it("maps a missing WorkOrderEditLock table during locked status change to 503", async () => {
    transactionMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "The table `public.WorkOrderEditLock` does not exist in the current database.",
        {
          code: "P2021",
          clientVersion: "test",
          meta: { table: "public.WorkOrderEditLock" },
        },
      ),
    );

    const response = await PATCH(new Request("http://localhost/api/work-orders/wo-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "in_progress",
        editToken: "tok",
        version: "2026-08-30T12:00:00.000Z",
      }),
    }), { params });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe(schemaMismatchUserMessage());
    expect(body.errorCode).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("work-order locked-update Tenant B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });
    workOrderFindFirstMock.mockResolvedValue(null);
    getWorkOrderEnterpriseStateMock.mockResolvedValue(null);
    getWorkOrderAssetLinkMock.mockResolvedValue({});
  });

  it("returns tenant-safe 404 when Tenant A patches a Tenant B work-order id", async () => {
    const response = await PATCH(new Request("http://localhost/api/work-orders/wo-tenant-b", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "in_progress",
        editToken: "tok",
        version: "2026-08-30T12:00:00.000Z",
      }),
    }), { params: Promise.resolve({ id: "wo-tenant-b" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Arbetsordern hittades inte");
    expect(workOrderFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { deleted_at: null, id: "wo-tenant-b", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(transactionMock).not.toHaveBeenCalled();
    expect(validateWorkOrderAssetLinksMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A reads a Tenant B work-order id", async () => {
    const response = await GET(
      new Request("http://localhost/api/work-orders/wo-tenant-b"),
      { params: Promise.resolve({ id: "wo-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Arbetsordern hittades inte");
    expect(workOrderFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { deleted_at: null, id: "wo-tenant-b", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(getLatestInvoiceDraftMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A deletes a Tenant B work-order id", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/work-orders/wo-tenant-b", { method: "DELETE" }),
      { params: Promise.resolve({ id: "wo-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Arbetsordern hittades inte");
    expect(workOrderFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "wo-tenant-b", company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
    }));
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe("work-order GET schema gaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });
    userFindManyMock.mockResolvedValue([]);
    getWorkOrderEnterpriseStateMock.mockResolvedValue(null);
    getWorkOrderAssetLinkMock.mockResolvedValue({});
    workOrderFindFirstMock.mockResolvedValue({
      id: "wo-1",
      assigned_to_id: "tech-1",
      estimated_cost: 100,
      actual_cost: 80,
    });
  });

  it("maps a missing WorkOrderStatusEvent table on GET to 503 SERVICE_UNAVAILABLE", async () => {
    getWorkOrderStatusEventsMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "The table `public.WorkOrderStatusEvent` does not exist in the current database.",
        {
          code: "P2021",
          clientVersion: "test",
          meta: { table: "public.WorkOrderStatusEvent" },
        },
      ),
    );

    const response = await GET(new Request("http://localhost/api/work-orders/wo-1"), { params });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe(schemaMismatchUserMessage());
    expect(body.errorCode).toBe("SERVICE_UNAVAILABLE");
  });
});
