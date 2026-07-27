import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  requireCompanyUserMock,
  canManageTicketsMock,
  canAssignWorkOrdersMock,
  isAssignedWorkAccessibleMock,
  redactTicketReporterPiiMock,
  ticketFindFirstMock,
  userFindFirstMock,
  transactionMock,
  txTicketUpdateManyMock,
  txTicketFindFirstMock,
  txAuditLogCreateMock,
  queueTicketNotificationMock,
  canTransitionWorkOrderMock,
  deriveWorkOrderStatusMock,
  allowedWorkOrderTransitionsMock,
  isTerminalWorkOrderStatusMock,
  isWorkOrderStatusMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  requireCompanyUserMock: vi.fn(),
  canManageTicketsMock: vi.fn(),
  canAssignWorkOrdersMock: vi.fn(),
  isAssignedWorkAccessibleMock: vi.fn(),
  redactTicketReporterPiiMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
  txTicketUpdateManyMock: vi.fn(),
  txTicketFindFirstMock: vi.fn(),
  txAuditLogCreateMock: vi.fn(),
  queueTicketNotificationMock: vi.fn(),
  canTransitionWorkOrderMock: vi.fn(),
  deriveWorkOrderStatusMock: vi.fn(),
  allowedWorkOrderTransitionsMock: vi.fn(),
  isTerminalWorkOrderStatusMock: vi.fn(),
  isWorkOrderStatusMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    user: { findFirst: userFindFirstMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  requireCompanyUser: requireCompanyUserMock,
  canManageTickets: canManageTicketsMock,
  canAssignWorkOrders: canAssignWorkOrdersMock,
}));

vi.mock("@/lib/assigned-work-access", () => ({
  isAssignedWorkAccessible: isAssignedWorkAccessibleMock,
  redactTicketReporterPii: redactTicketReporterPiiMock,
}));

vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: queueTicketNotificationMock,
}));

vi.mock("@/lib/sla", () => ({
  calculateDueDate: vi.fn(() => new Date("2026-08-01T00:00:00.000Z")),
}));

vi.mock("@/lib/work-order-lifecycle", () => ({
  allowedWorkOrderTransitions: allowedWorkOrderTransitionsMock,
  canTransitionWorkOrder: canTransitionWorkOrderMock,
  deriveWorkOrderStatus: deriveWorkOrderStatusMock,
  isTerminalWorkOrderStatus: isTerminalWorkOrderStatusMock,
  isWorkOrderStatus: isWorkOrderStatusMock,
}));

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { DELETE, GET, PATCH } from "./route";

const requestId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const companyUser = {
  id: "user-1",
  email: "admin@example.se",
  role: "admin",
  company_id: "company-1",
};
const context = { params: Promise.resolve({ id: "ticket-1" }) };

function request(method: string, body?: unknown) {
  return new Request("https://www.revalta.se/api/tickets/ticket-1", {
    method,
    headers: {
      "x-request-id": requestId,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function baseTicket() {
  return {
    id: "ticket-1",
    title: "Läckage",
    description: "Vatten under diskbänk",
    status: "new",
    category: "water",
    priority: "high",
    public_reference: null,
    source: "internal",
    reporter_name: "Boende",
    reporter_email: "resident@example.se",
    reporter_phone: "0700000000",
    reporter_unit: "A1001",
    property_id: "property-1",
    assigned_to_id: null,
    created_at: new Date("2026-07-27T00:00:00.000Z"),
    updated_at: new Date("2026-07-27T00:00:00.000Z"),
    due_date: null,
    ai_summary: null,
    ai_recommended_action: null,
    ai_confidence: null,
    ai_processed_at: null,
    property: { id: "property-1", name: "Kvarteret", address: "Gatan 1", city: "Göteborg" },
    assigned_to: null,
    comments: [],
    attachments: [],
  };
}

describe("ticket detail lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(companyUser);
    requireCompanyUserMock.mockReturnValue(companyUser);
    canManageTicketsMock.mockReturnValue(true);
    canAssignWorkOrdersMock.mockReturnValue(true);
    isAssignedWorkAccessibleMock.mockReturnValue(true);
    isWorkOrderStatusMock.mockImplementation((value: unknown) =>
      ["new", "assigned", "in_progress", "inspection", "closed"].includes(String(value)),
    );
    allowedWorkOrderTransitionsMock.mockReturnValue(["assigned"]);
    canTransitionWorkOrderMock.mockReturnValue(true);
    deriveWorkOrderStatusMock.mockReturnValue("assigned");
    isTerminalWorkOrderStatusMock.mockReturnValue(false);
    redactTicketReporterPiiMock.mockImplementation((_user, ticket) => ({ ...ticket, reporter_email: null }));
    queueTicketNotificationMock.mockResolvedValue(undefined);
    createLoggerMock.mockReturnValue({
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
      debug: vi.fn(),
    });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        ticket: { updateMany: txTicketUpdateManyMock, findFirst: txTicketFindFirstMock },
        auditLog: { create: txAuditLogCreateMock },
      }),
    );
  });

  it("fails closed before database access without a company user", async () => {
    requireCompanyUserMock.mockReturnValue(null);

    const response = await GET(request("GET"), context);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.errorCode).toBe("FORBIDDEN");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("reads only the verified company scope and preserves PII redaction", async () => {
    ticketFindFirstMock.mockResolvedValue(baseTicket());

    const response = await GET(request("GET"), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(ticketFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "ticket-1",
          company_id: "company-1",
          deleted_at: null,
        }),
      }),
    );
    expect(redactTicketReporterPiiMock).toHaveBeenCalled();
    expect(payload.ticket.reporter_email).toBeNull();
    expect(payload.requestId).toBe(requestId);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("returns a stable conflict for an invalid lifecycle transition", async () => {
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckage",
      status: "new",
      priority: "high",
      assigned_to_id: null,
      due_date: null,
    });
    canTransitionWorkOrderMock.mockReturnValue(false);

    const response = await PATCH(request("PATCH", { status: "closed" }), context);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.errorCode).toBe("CONFLICT");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 409 when optimistic concurrency detects a changed ticket", async () => {
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckage",
      status: "new",
      priority: "high",
      assigned_to_id: null,
      due_date: null,
    });
    userFindFirstMock.mockResolvedValue({ id: "user-2" });
    txTicketUpdateManyMock.mockResolvedValue({ count: 0 });

    const response = await PATCH(request("PATCH", { assignedToId: "user-2" }), context);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.errorCode).toBe("CONFLICT");
    expect(txAuditLogCreateMock).not.toHaveBeenCalled();
  });

  it("returns success after commit even when notification delivery fails", async () => {
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckage",
      status: "new",
      priority: "high",
      assigned_to_id: null,
      due_date: null,
    });
    userFindFirstMock.mockResolvedValue({ id: "user-2" });
    txTicketUpdateManyMock.mockResolvedValue({ count: 1 });
    txTicketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckage",
      status: "assigned",
      priority: "high",
      due_date: null,
      closed_at: null,
      assigned_to: { id: "user-2", name: "Tekniker", email: "tech@example.se" },
    });
    txAuditLogCreateMock.mockResolvedValue({ id: "audit-1" });
    queueTicketNotificationMock.mockRejectedValue(new Error("provider unavailable"));

    const response = await PATCH(request("PATCH", { assignedToId: "user-2" }), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(txAuditLogCreateMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "ticket update partial failure",
      expect.objectContaining({ eventCode: "tickets.update.partial_failure" }),
    );
  });

  it("soft-deletes and writes its audit record in the same transaction", async () => {
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      status: "new",
      assigned_to_id: null,
    });
    txTicketUpdateManyMock.mockResolvedValue({ count: 1 });
    txAuditLogCreateMock.mockResolvedValue({ id: "audit-1" });

    const response = await DELETE(request("DELETE"), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txTicketUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ company_id: "company-1", status: "new" }),
        data: { deleted_at: expect.any(Date) },
      }),
    );
    expect(txAuditLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ticket.deleted", company_id: "company-1" }),
      }),
    );
  });
});