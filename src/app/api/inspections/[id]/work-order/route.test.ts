import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  inspectionFindFirstMock,
  auditFindFirstMock,
  writeAuditLogMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  inspectionFindFirstMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
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
    complianceInspection: {
      findFirst: inspectionFindFirstMock,
    },
    auditLog: { findFirst: auditFindFirstMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/work-order-enterprise-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/work-order-enterprise-core")>()),
  allocateWorkOrderNumber: vi.fn().mockResolvedValue("AO-0001"),
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

describe("inspections/[id]/work-order route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("returns 404 when creating work order for inspection on soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    inspectionFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "inspection-1" });

    const response = await POST(new Request("http://localhost/api/inspections/inspection-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "inspection-1" }) });

    expect(response.status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("fail-closes legacy inspection work-order creation with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    inspectionFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1", metadata: {} });

    const response = await POST(new Request("http://localhost/api/inspections/legacy-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "legacy-1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  const validInspection = {
    id: "inspection-1",
    status: "action_required",
    work_order_id: null,
    property_id: "property-1",
    title: "OVK-kontroll",
    note: null,
    supplier: null,
    type: "ovk",
    due_date: new Date("2026-09-01"),
    property: { id: "property-1", name: "Storgatan 1" },
  };

  it("returns 409 without creating a work order when a concurrent request already holds the lock", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    inspectionFindFirstMock.mockResolvedValue(validInspection);
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ locked: false }]) };
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const response = await POST(new Request("http://localhost/api/inspections/inspection-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "inspection-1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/försök igen/i);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the fresh in-lock read shows the inspection was already linked", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    inspectionFindFirstMock.mockResolvedValue(validInspection);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      complianceInspection: {
        findFirst: vi.fn().mockResolvedValue({ work_order_id: "work-order-existing" }),
      },
    };
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const response = await POST(new Request("http://localhost/api/inspections/inspection-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "inspection-1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.workOrderId).toBe("work-order-existing");
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("creates exactly one work order, links it back and writes audit in the same transaction", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    inspectionFindFirstMock.mockResolvedValue(validInspection);
    const workOrderCreateMock = vi.fn().mockResolvedValue({ id: "work-order-new" });
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      complianceInspection: {
        findFirst: vi.fn().mockResolvedValue({ work_order_id: null }),
        updateMany: updateManyMock,
      },
      workOrder: { create: workOrderCreateMock },
    };
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const response = await POST(new Request("http://localhost/api/inspections/inspection-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "inspection-1" }) });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(workOrderCreateMock).toHaveBeenCalledTimes(1);
    expect(updateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "inspection-1", company_id: "company-1", work_order_id: null },
      data: { work_order_id: "work-order-new" },
    }));
    expect(body).toEqual(expect.objectContaining({ success: true, workOrderId: "work-order-new" }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", company_id: "company-1" }),
      expect.objectContaining({
        entityType: "compliance_inspection",
        entityId: "inspection-1",
        action: "inspection.work_order_created",
        metadata: expect.objectContaining({ workOrderId: "work-order-new", propertyId: "property-1" }),
      }),
      tx,
    );
  });

  it("returns 500 when mandatory audit fails inside the transaction instead of committing a silent partial success", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    inspectionFindFirstMock.mockResolvedValue(validInspection);
    const workOrderCreateMock = vi.fn().mockResolvedValue({ id: "work-order-new" });
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      complianceInspection: {
        findFirst: vi.fn().mockResolvedValue({ work_order_id: null }),
        updateMany: updateManyMock,
      },
      workOrder: { create: workOrderCreateMock },
    };
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const response = await POST(new Request("http://localhost/api/inspections/inspection-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "inspection-1" }) });

    expect(response.status).toBe(500);
    expect(workOrderCreateMock).toHaveBeenCalledTimes(1);
    expect(updateManyMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx);
  });

  it("returns 500 without reporting success if the in-lock updateMany somehow links zero rows", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    inspectionFindFirstMock.mockResolvedValue(validInspection);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      complianceInspection: {
        findFirst: vi.fn().mockResolvedValue({ work_order_id: null }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      workOrder: { create: vi.fn().mockResolvedValue({ id: "work-order-new" }) },
    };
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const response = await POST(new Request("http://localhost/api/inspections/inspection-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "inspection-1" }) });

    expect(response.status).toBe(500);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
