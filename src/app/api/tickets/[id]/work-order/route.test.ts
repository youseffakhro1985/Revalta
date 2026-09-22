import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { schemaMismatchUserMessage } from "@/lib/schema-readiness";

const {
  getCurrentUserMock,
  ticketFindFirstMock,
  workOrderFindFirstMock,
  unitFindFirstMock,
  userFindFirstMock,
  transactionMock,
  loggerErrorMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  unitFindFirstMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    workOrder: { findFirst: workOrderFindFirstMock },
    unit: { findFirst: unitFindFirstMock },
    user: { findFirst: userFindFirstMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/schema-readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema-readiness")>()),
  hasTicketAiSourceColumn: vi.fn(async () => true),
  hasWorkOrderVendorContractColumn: vi.fn(async () => false),
}));

vi.mock("@/lib/work-order-enterprise-core", () => ({
  addWorkOrderStatusEvent: vi.fn(),
  allocateWorkOrderNumber: vi.fn(),
  calculateWorkOrderSla: vi.fn(() => ({ responseDueAt: null, resolutionDueAt: null })),
  setWorkOrderEnterpriseFields: vi.fn(),
}));

vi.mock("@/lib/work-order-workflow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/work-order-workflow")>()),
  normalizeWorkOrderPriority: vi.fn((value: string) => value || "normal"),
}));

vi.mock("@/lib/structured-logger", () => ({
  createLogger: () => ({ error: loggerErrorMock, warn: vi.fn() }),
}));

vi.mock("@/lib/ai", () => ({
  analyzeTicket: vi.fn(async () => ({
    category: "other",
    priority: "normal",
    confidence: 0.5,
    summary: "test",
    recommendedAction: "Planera åtgärd",
    source: "fallback",
  })),
}));

import { GET, POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/tickets/ticket-1/work-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "ticket-1" }) };
const technician = {
  id: "tech-1",
  company_id: "company-1",
  role: "technician",
  email: "tech@example.com",
};
const accessibleTicket = {
  id: "ticket-1",
  property_id: "property-1",
  assigned_to_id: "tech-1",
  status: "received",
  title: "Läckage",
  description: "Kontrollera läckage",
  priority: "normal",
};

describe("ticket work-order creation authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(technician);
    ticketFindFirstMock.mockResolvedValue(accessibleTicket);
    workOrderFindFirstMock.mockResolvedValue(null);
  });

  it("keeps the parent ticket lookup scoped to the authenticated company", async () => {
    ticketFindFirstMock.mockResolvedValue(null);

    const response = await POST(request({}), params);

    expect(response.status).toBe(404);
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "ticket-1",
        company_id: "company-1",
        deleted_at: null,
      }),
    }));
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A creates a work order from a Tenant B ticket id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue(null);

    const response = await POST(request({}), { params: Promise.resolve({ id: "ticket-tenant-b" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Ärendet hittades inte");
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "ticket-tenant-b",
        company_id: "company-1",
        deleted_at: null,
      }),
    }));
    expect(transactionMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("prevents a technician from assigning a new work order to another user", async () => {
    const response = await POST(request({ assignedToId: "tech-2" }), params);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Du saknar behörighet att tilldela arbetsorder till andra",
      errorCode: "FORBIDDEN",
    });
    expect(userFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("prevents a technician from setting an estimated work-order cost", async () => {
    const response = await POST(request({ estimatedCost: 1250 }), params);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Du saknar behörighet att sätta arbetsorderkostnader",
      errorCode: "FORBIDDEN",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when the unit is not owned through the ticket company property", async () => {
    unitFindFirstMock.mockResolvedValue(null);

    const response = await POST(request({ unitId: "unit-tenant-b" }), params);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Enheten hittades inte");
    expect(body.errorCode).toBe("NOT_FOUND");
    expect(unitFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: "unit-tenant-b",
        property_id: "property-1",
        property: { company_id: "company-1", deleted_at: null },
      },
      select: { id: true },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects resident GET before loading tickets or work orders", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await GET(new Request("https://www.revalta.se/api/tickets/ticket-1/work-order"), params);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.errorCode).toBe("FORBIDDEN");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
  });

  it("rejects resident POST before looking up a ticket", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await POST(request({}), params);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(body.errorCode).toBe("FORBIDDEN");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("denies viewers with the work-order create copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });

    const response = await POST(request({}), params);

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att skapa arbetsordrar");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });
});

describe("ticket work-order creation schema failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(technician);
    ticketFindFirstMock.mockResolvedValue(accessibleTicket);
    workOrderFindFirstMock.mockResolvedValue(null);
  });

  it("maps missing schema columns to 503 SERVICE_UNAVAILABLE without a workOrderId", async () => {
    transactionMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Column not found", {
        code: "P2022",
        clientVersion: "test",
        meta: { column: "WorkOrder.work_order_number" },
      }),
    );

    const response = await POST(request({}), params);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: schemaMismatchUserMessage(),
      errorCode: "SERVICE_UNAVAILABLE",
    });
    expect(body.workOrderId).toBeUndefined();
  });

  it("maps a missing WorkOrderNumberCounter table to 503 SERVICE_UNAVAILABLE", async () => {
    transactionMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "The table `public.WorkOrderNumberCounter` does not exist in the current database.",
        {
          code: "P2021",
          clientVersion: "test",
          meta: { table: "public.WorkOrderNumberCounter" },
        },
      ),
    );

    const response = await POST(request({}), params);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.errorCode).toBe("SERVICE_UNAVAILABLE");
    expect(body.workOrderId).toBeUndefined();
  });

  it("returns 500 INTERNAL_ERROR without a workOrderId for unexpected create failures", async () => {
    transactionMock.mockRejectedValue(new Error("boom"));

    const response = await POST(request({}), params);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Kunde inte skapa arbetsorder från ärendet",
      errorCode: "INTERNAL_ERROR",
    });
    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it("maps a WorkOrder lookup schema gap before create to 503 JSON", async () => {
    workOrderFindFirstMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Column not found", {
        code: "P2022",
        clientVersion: "test",
        meta: { column: "WorkOrder.deleted_at" },
      }),
    );

    const response = await POST(request({}), params);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.errorCode).toBe("SERVICE_UNAVAILABLE");
    expect(body.workOrderId).toBeUndefined();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("reuses an existing work order only when it belongs to the caller company", async () => {
    const txFindFirst = vi.fn().mockResolvedValue({ id: "wo-1", deleted_at: null });
    const txCreate = vi.fn();
    transactionMock.mockImplementation(async (callback: (tx: { workOrder: { findFirst: typeof txFindFirst; create: typeof txCreate } }) => unknown) =>
      callback({ workOrder: { findFirst: txFindFirst, create: txCreate } }),
    );

    const response = await POST(request({}), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ workOrderId: "wo-1", created: false });
    expect(txFindFirst).toHaveBeenCalledWith({
      where: { ticket_id: "ticket-1", company_id: "company-1" },
      select: { id: true, deleted_at: true },
    });
    expect(txCreate).not.toHaveBeenCalled();
  });
});

describe("ticket work-order GET schema gaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(technician);
    ticketFindFirstMock.mockResolvedValue(accessibleTicket);
  });

  it("maps a missing WorkOrder table on GET probe to 503 SERVICE_UNAVAILABLE", async () => {
    workOrderFindFirstMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "The table `public.WorkOrder` does not exist in the current database.",
        {
          code: "P2021",
          clientVersion: "test",
          meta: { table: "public.WorkOrder" },
        },
      ),
    );

    const response = await GET(
      new Request("https://www.revalta.se/api/tickets/ticket-1/work-order"),
      params,
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe(schemaMismatchUserMessage());
    expect(body.errorCode).toBe("SERVICE_UNAVAILABLE");
    expect(body.workOrderId).toBeUndefined();
  });
});
