import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketFindFirstMock,
  commentCreateMock,
  transactionMock,
  writeAuditLogMock,
  queueTicketNotificationMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  commentCreateMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  queueTicketNotificationMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageTickets: () => true,
  tenantWhere: () => ({ company_id: "company-1" }),
}));
vi.mock("@/lib/assigned-work-access", () => ({
  isAssignedWorkAccessible: () => true,
  notFoundTicket: () => Response.json({ error: "Ärendet hittades inte" }, { status: 404 }),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/integrations", () => ({ queueTicketNotification: queueTicketNotificationMock }));
vi.mock("@/lib/structured-logger", () => ({
  createLogger: () => ({ error: loggerErrorMock, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    $transaction: transactionMock,
  },
}));

import { POST } from "./route";

function request() {
  return new Request("https://www.revalta.se/api/tickets/ticket-1/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "  Kontrollera läckan  ", isInternal: true }),
  });
}

const context = { params: Promise.resolve({ id: "ticket-1" }) };
const comment = {
  id: "comment-1",
  body: "Kontrollera läckan",
  is_internal: true,
  created_at: new Date("2026-09-02T00:00:00Z"),
  author_type: "staff",
  author_name: "Owner",
  author_email: "owner@example.com",
  user: { name: "Owner", email: "owner@example.com" },
};

describe("ticket comment reliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      name: "Owner",
      email: "owner@example.com",
      role: "owner",
      company_id: "company-1",
    });
    ticketFindFirstMock.mockResolvedValue({ id: "ticket-1", title: "Leak", assigned_to_id: null });
    commentCreateMock.mockResolvedValue(comment);
    writeAuditLogMock.mockResolvedValue(undefined);
    queueTicketNotificationMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      ticketComment: { create: commentCreateMock },
    }));
  });

  it("returns 201 after commit even when notification delivery/journaling fails", async () => {
    queueTicketNotificationMock.mockRejectedValue(new Error("email integration unavailable"));

    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ success: true, comment: { id: "comment-1", body: "Kontrollera läckan" } });
    expect(loggerErrorMock).toHaveBeenCalledWith("Ticket comment notification failed", expect.any(Error));
  });

  it("keeps comment creation and audit in one transaction and does not notify after rollback", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit failed"));

    const response = await POST(request(), context);

    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(commentCreateMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ action: "ticket.comment_created" }),
      expect.objectContaining({ ticketComment: { create: commentCreateMock } }),
    );
    expect(queueTicketNotificationMock).not.toHaveBeenCalled();
  });

  it("does not create a comment for a ticket outside the tenant scope", async () => {
    ticketFindFirstMock.mockResolvedValue(null);

    const response = await POST(request(), context);

    expect(response.status).toBe(404);
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "ticket-1", company_id: "company-1", deleted_at: null }),
    }));
    expect(transactionMock).not.toHaveBeenCalled();
    expect(queueTicketNotificationMock).not.toHaveBeenCalled();
  });
});
