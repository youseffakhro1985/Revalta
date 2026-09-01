import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketFindFirstMock,
  ticketUpdateManyMock,
  auditLogCreateMock,
  transactionMock,
  writeAuditLogMock,
  queueTicketNotificationMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  ticketUpdateManyMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  queueTicketNotificationMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  requireCompanyUser: (user: unknown) => user,
  canManageTickets: () => true,
  canAssignWorkOrders: () => true,
  tenantWhere: () => ({ company_id: "company-1" }),
}));
vi.mock("@/lib/assigned-work-access", () => ({
  isAssignedWorkAccessible: () => true,
  notFoundTicket: () => Response.json({ error: "Ärendet hittades inte" }, { status: 404 }),
  redactTicketReporterPii: (_user: unknown, ticket: unknown) => ticket,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/integrations", () => ({ queueTicketNotification: queueTicketNotificationMock }));
vi.mock("@/lib/structured-logger", () => ({
  createLogger: () => ({ error: loggerErrorMock, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock, updateMany: ticketUpdateManyMock },
    user: { findFirst: vi.fn() },
    auditLog: { create: auditLogCreateMock },
    $transaction: transactionMock,
  },
}));

import { DELETE, PATCH } from "./route";

const params = Promise.resolve({ id: "ticket-1" });
const user = {
  id: "owner-1",
  email: "owner@example.se",
  company_id: "company-1",
  role: "owner",
};
const existing = {
  id: "ticket-1",
  title: "Läckande kran",
  status: "new",
  priority: "normal",
  assigned_to_id: null,
  due_date: null,
};
const updated = {
  id: "ticket-1",
  title: "Läckande kran",
  status: "planned",
  priority: "normal",
  due_date: null,
  closed_at: null,
  assigned_to: null,
};

function patchRequest() {
  return new Request("https://www.revalta.se/api/tickets/ticket-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "planned" }),
  });
}

function deleteRequest() {
  return new Request("https://www.revalta.se/api/tickets/ticket-1", { method: "DELETE" });
}

describe("ticket mutation post-commit reliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(user);
    ticketUpdateManyMock.mockResolvedValue({ count: 1 });
    auditLogCreateMock.mockResolvedValue(undefined);
    writeAuditLogMock.mockResolvedValue(undefined);
    queueTicketNotificationMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      ticket: { findFirst: ticketFindFirstMock, updateMany: ticketUpdateManyMock },
      auditLog: { create: auditLogCreateMock },
    }));
  });

  it("returns 200 after an atomic PATCH even if secondary audit and notification fail", async () => {
    ticketFindFirstMock
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    writeAuditLogMock.mockRejectedValue(new Error("secondary audit unavailable"));
    queueTicketNotificationMock.mockRejectedValue(new Error("notification unavailable"));

    const response = await PATCH(patchRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, ticket: { id: "ticket-1", status: "planned" } });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(auditLogCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        entity_id: "ticket-1",
        action: "ticket.status_changed",
      }),
    }));
    expect(loggerErrorMock).toHaveBeenCalledWith("Ticket lifecycle telemetry audit failed", expect.any(Error));
    expect(loggerErrorMock).toHaveBeenCalledWith("Ticket update notification failed", expect.any(Error));
  });

  it("returns 200 for an already committed soft-delete even if audit journaling fails", async () => {
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckande kran",
      status: "new",
      assigned_to_id: null,
    });
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    const response = await DELETE(deleteRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(ticketUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "ticket-1", company_id: "company-1", deleted_at: null },
    }));
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "Ticket delete audit failed after committed soft-delete",
      expect.any(Error),
    );
  });
});
