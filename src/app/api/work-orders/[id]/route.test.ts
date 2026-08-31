import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  userFindManyMock,
  transactionMock,
  getWorkOrderEnterpriseStateMock,
  getWorkOrderStatusEventsMock,
  getWorkOrderAssetLinkMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  userFindManyMock: vi.fn(),
  transactionMock: vi.fn(),
  getWorkOrderEnterpriseStateMock: vi.fn(),
  getWorkOrderStatusEventsMock: vi.fn(),
  getWorkOrderAssetLinkMock: vi.fn(),
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
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock, updateMany: vi.fn() },
    user: { findMany: userFindManyMock, findFirst: vi.fn() },
    $transaction: transactionMock,
  },
}));

import { GET, PATCH } from "./route";

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
});
