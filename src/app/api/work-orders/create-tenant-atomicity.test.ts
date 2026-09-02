import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  propertyFindFirstMock,
  unitFindFirstMock,
  userFindFirstMock,
  transactionMock,
  workOrderCreateMock,
  allocateWorkOrderNumberMock,
  setWorkOrderEnterpriseFieldsMock,
  setWorkOrderAssetLinksMock,
  validateWorkOrderAssetLinksMock,
  addWorkOrderStatusEventMock,
  writeAuditLogMock,
  findAccessibleTicketMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  unitFindFirstMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
  workOrderCreateMock: vi.fn(),
  allocateWorkOrderNumberMock: vi.fn(),
  setWorkOrderEnterpriseFieldsMock: vi.fn(),
  setWorkOrderAssetLinksMock: vi.fn(),
  validateWorkOrderAssetLinksMock: vi.fn(),
  addWorkOrderStatusEventMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  findAccessibleTicketMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageTickets: (role: string) => ["owner", "admin", "manager", "technician"].includes(role),
  canAssignWorkOrders: (role: string) => ["owner", "admin", "manager"].includes(role),
  canManageWorkOrderFinance: (role: string) => ["owner", "admin", "manager"].includes(role),
  canViewFinanceData: () => true,
  shouldScopeToAssignedWork: () => false,
}));

vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    unit: { findFirst: unitFindFirstMock },
    user: { findFirst: userFindFirstMock, findMany: vi.fn() },
    workOrder: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/work-order-enterprise-core", () => ({
  WORK_ORDER_SOURCES: ["internal", "ticket", "component"],
  WORK_ORDER_TYPES: ["corrective", "preventive"],
  normalizeWorkOrderSource: (value: string) => value,
  normalizeWorkOrderType: (value: string) => value,
  calculateWorkOrderSla: () => ({ responseDueAt: null, resolutionDueAt: null }),
  allocateWorkOrderNumber: allocateWorkOrderNumberMock,
  setWorkOrderEnterpriseFields: setWorkOrderEnterpriseFieldsMock,
  addWorkOrderStatusEvent: addWorkOrderStatusEventMock,
}));

vi.mock("@/lib/work-order-workflow", () => ({
  WORK_ORDER_PRIORITIES: ["low", "normal", "high", "urgent"],
  WORK_ORDER_STATUSES: ["planned", "assigned", "in_progress", "completed", "invoiced", "cancelled"],
  normalizeWorkOrderPriority: (value: string) => value,
  normalizeWorkOrderStatus: (value: string) => value,
}));

vi.mock("@/lib/work-order-asset-links", () => ({
  validateWorkOrderAssetLinks: validateWorkOrderAssetLinksMock,
  setWorkOrderAssetLinks: setWorkOrderAssetLinksMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/assigned-work-access", () => ({ findAccessibleTicket: findAccessibleTicketMock }));
vi.mock("@/lib/schema-readiness", () => ({
  isMissingSchemaColumnError: () => false,
  notDeletedFilter: vi.fn().mockResolvedValue({ deleted_at: null }),
  schemaMismatchUserMessage: () => "Databasen behöver uppdateras",
}));
vi.mock("@/lib/soft-delete-compat", () => ({ sqlSoftDeleteGuard: vi.fn().mockResolvedValue("") }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/work-order-sla", () => ({ evaluateWorkOrderSla: vi.fn() }));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const manager = { id: "manager-1", company_id: "company-1", role: "manager", email: "manager@example.se" };
const tx = { workOrder: { create: workOrderCreateMock } };

function request(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/work-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    propertyId: "property-1",
    title: "Kontrollera ventilation",
    description: "Kontrollera aggregatet och dokumentera utfört arbete",
    ...overrides,
  };
}

describe("work-order create tenant and atomicity boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
    getCurrentUserMock.mockResolvedValue(manager);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
    unitFindFirstMock.mockResolvedValue({ id: "unit-1" });
    userFindFirstMock.mockResolvedValue({ id: "assignee-1" });
    findAccessibleTicketMock.mockResolvedValue({ id: "ticket-1", property_id: "property-1" });
    validateWorkOrderAssetLinksMock.mockResolvedValue(undefined);
    allocateWorkOrderNumberMock.mockResolvedValue("AO-1001");
    setWorkOrderEnterpriseFieldsMock.mockResolvedValue(undefined);
    setWorkOrderAssetLinksMock.mockResolvedValue(undefined);
    addWorkOrderStatusEventMock.mockResolvedValue(undefined);
    writeAuditLogMock.mockResolvedValue(undefined);
    workOrderCreateMock.mockResolvedValue({
      id: "work-order-1",
      company_id: "company-1",
      property_id: "property-1",
      title: "Kontrollera ventilation",
      description: "Kontrollera aggregatet och dokumentera utfört arbete",
      status: "planned",
      priority: "normal",
    });
    transactionMock.mockImplementation(async (callback) => callback(tx));
  });

  it("commits creation and mandatory audit through the same transaction client", async () => {
    const response = await POST(request(validBody({ assignedToId: "assignee-1" })));

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "manager-1", company_id: "company-1" }),
      expect.objectContaining({
        entityType: "work_order",
        entityId: "work-order-1",
        action: "work_order.created",
      }),
      tx,
    );
  });

  it("returns a safe 500 when mandatory audit fails inside the transaction boundary", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit failure"));

    const response = await POST(request(validBody()));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx);
  });

  it("never accepts a property outside the authenticated company", async () => {
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await POST(request(validBody()));

    expect(response.status).toBe(404);
    expect(propertyFindFirstMock).toHaveBeenCalledWith({
      where: { id: "property-1", company_id: "company-1", deleted_at: null },
      select: { id: true },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("never accepts an assignee outside the authenticated company", async () => {
    userFindFirstMock.mockResolvedValue(null);

    const response = await POST(request(validBody({ assignedToId: "foreign-user" })));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Ansvarig användare hittades inte");
    expect(userFindFirstMock).toHaveBeenCalledWith({
      where: { id: "foreign-user", company_id: "company-1", status: "active" },
      select: { id: true },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("never links a ticket that is not accessible to the authenticated company", async () => {
    findAccessibleTicketMock.mockResolvedValue(null);

    const response = await POST(request(validBody({ ticketId: "foreign-ticket" })));

    expect(response.status).toBe(404);
    expect(findAccessibleTicketMock).toHaveBeenCalledWith(manager, "foreign-ticket");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("requires a unit to belong to the already tenant-verified property", async () => {
    unitFindFirstMock.mockResolvedValue(null);

    const response = await POST(request(validBody({ unitId: "foreign-unit" })));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Enheten tillhör inte fastigheten");
    expect(unitFindFirstMock).toHaveBeenCalledWith({
      where: { id: "foreign-unit", property_id: "property-1" },
      select: { id: true },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("passes the authenticated company into asset-link validation", async () => {
    const response = await POST(request(validBody({ buildingId: "building-1", technicalAssetId: "asset-1" })));

    expect(response.status).toBe(201);
    expect(validateWorkOrderAssetLinksMock).toHaveBeenCalledWith(expect.anything(), {
      companyId: "company-1",
      propertyId: "property-1",
      buildingId: "building-1",
      technicalAssetId: "asset-1",
    });
  });
});
