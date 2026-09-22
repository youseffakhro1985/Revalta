import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  propertyFindFirstMock,
  userFindFirstMock,
  vendorFindFirstMock,
  transactionMock,
  workOrderCreateMock,
  allocateWorkOrderNumberMock,
  setWorkOrderEnterpriseFieldsMock,
  setWorkOrderAssetLinksMock,
  validateWorkOrderAssetLinksMock,
  addWorkOrderStatusEventMock,
  writeAuditLogMock,
  hasVendorColumnMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  vendorFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
  workOrderCreateMock: vi.fn(),
  allocateWorkOrderNumberMock: vi.fn(),
  setWorkOrderEnterpriseFieldsMock: vi.fn(),
  setWorkOrderAssetLinksMock: vi.fn(),
  validateWorkOrderAssetLinksMock: vi.fn(),
  addWorkOrderStatusEventMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  hasVendorColumnMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  requireCompanyUser: (user: { company_id: string | null; role: string } | null) => {
    if (!user?.company_id) return null;
    if (!["owner", "admin", "manager", "technician", "viewer"].includes(user.role)) return null;
    return user;
  },
  canManageTickets: (role: string) => ["owner", "admin", "manager", "technician"].includes(role),
  canAssignWorkOrders: (role: string) => ["owner", "admin", "manager"].includes(role),
  canManageWorkOrderFinance: (role: string) => ["owner", "admin", "manager"].includes(role),
  canViewFinanceData: () => true,
  shouldScopeToAssignedWork: () => false,
}));

vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    unit: { findFirst: vi.fn() },
    user: { findFirst: userFindFirstMock, findMany: vi.fn() },
    vendorContract: { findFirst: vendorFindFirstMock, findMany: vi.fn() },
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

vi.mock("@/lib/work-order-workflow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/work-order-workflow")>()),
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
vi.mock("@/lib/assigned-work-access", () => ({ findAccessibleTicket: vi.fn() }));
vi.mock("@/lib/schema-readiness", () => ({
  isMissingSchemaColumnError: () => false,
  notDeletedFilter: vi.fn().mockResolvedValue({ deleted_at: null }),
  schemaMismatchUserMessage: () => "Databasen behöver uppdateras",
  hasWorkOrderVendorContractColumn: hasVendorColumnMock,
  workOrderVendorWrite: (hasColumn: boolean, vendorContractId: string | null) =>
    (hasColumn ? { vendor_contract_id: vendorContractId } : {}),
  workOrderVendorRelationSelect: (hasColumn: boolean) =>
    (hasColumn
      ? { vendor_contract: { select: { id: true, name: true, category: true, status: true } } }
      : {}),
}));
vi.mock("@/lib/soft-delete-compat", () => ({ sqlSoftDeleteGuard: vi.fn().mockResolvedValue("") }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/work-order-sla", () => ({ evaluateWorkOrderSla: vi.fn() }));
vi.mock("@/lib/integrations", () => ({ recordAiEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/assignee-notify", () => ({ notifyAssignee: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/vendor-notify", () => ({ notifyVendor: vi.fn().mockResolvedValue({ emailed: true }) }));
vi.mock("@/lib/ai", () => ({
  analyzeTicket: vi.fn().mockResolvedValue({
    category: "other",
    priority: "normal",
    confidence: 0.5,
    summary: "Regelbaserad analys",
    recommendedAction: "Dokumentera och följ upp",
    source: "fallback",
  }),
}));

import { POST } from "./route";
import { notifyVendor } from "@/lib/vendor-notify";

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

describe("work-order vendor contract assignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
    getCurrentUserMock.mockResolvedValue(manager);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
    userFindFirstMock.mockResolvedValue({ id: "assignee-1", email: "tech@example.se" });
    vendorFindFirstMock.mockResolvedValue({ id: "vendor-1", name: "Städ AB", category: "Städ", email: "kontakt@stad.se" });
    hasVendorColumnMock.mockResolvedValue(true);
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

  it("persists a tenant-scoped vendor contract on create", async () => {
    const response = await POST(request(validBody({ vendorContractId: "vendor-1" })));

    expect(response.status).toBe(201);
    expect(vendorFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: "vendor-1",
        company_id: "company-1",
        status: "active",
        OR: [{ property_id: null }, { property_id: "property-1" }],
      },
      select: { id: true, name: true, category: true, email: true },
    });
    expect(workOrderCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ vendor_contract_id: "vendor-1" }),
    });
    expect(notifyVendor).toHaveBeenCalledWith(
      expect.objectContaining({ id: "manager-1", company_id: "company-1" }),
      expect.objectContaining({
        workOrderId: "work-order-1",
        vendorContractId: "vendor-1",
        vendorEmail: "kontakt@stad.se",
        workOrderNumber: "AO-1001",
      }),
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({ vendorContractId: "vendor-1" }),
      }),
      tx,
    );
  });

  it("never accepts a vendor outside the authenticated company or property", async () => {
    vendorFindFirstMock.mockResolvedValue(null);

    const response = await POST(request(validBody({ vendorContractId: "foreign-vendor" })));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Leverantören hittades inte");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 503 instead of writing vendor_contract_id before Database Release", async () => {
    hasVendorColumnMock.mockResolvedValue(false);

    const response = await POST(request(validBody({ vendorContractId: "vendor-1" })));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/Databasen behöver uppdateras/);
    expect(vendorFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("omits vendor_contract_id from create when the column is not released and no vendor was requested", async () => {
    hasVendorColumnMock.mockResolvedValue(false);

    const response = await POST(request(validBody()));

    expect(response.status).toBe(201);
    expect(workOrderCreateMock.mock.calls[0][0].data.vendor_contract_id).toBeUndefined();
  });

  it("prevents a technician from assigning a vendor on create", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await POST(request(validBody({ vendorContractId: "vendor-1" })));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Du saknar behörighet att tilldela arbetsorder till leverantör");
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
