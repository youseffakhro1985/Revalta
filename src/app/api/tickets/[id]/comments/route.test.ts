import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  requireCompanyUserMock,
  canManageTicketsMock,
  ticketFindFirstMock,
  ticketCommentCreateMock,
  auditLogCreateMock,
  transactionMock,
  queueTicketNotificationMock,
  isAssignedWorkAccessibleMock,
  isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessageMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  requireCompanyUserMock: vi.fn(),
  canManageTicketsMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  ticketCommentCreateMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
  transactionMock: vi.fn(),
  queueTicketNotificationMock: vi.fn(),
  isAssignedWorkAccessibleMock: vi.fn(),
  isMissingSchemaColumnErrorMock: vi.fn(),
  schemaMismatchUserMessageMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  requireCompanyUser: requireCompanyUserMock,
  canManageTickets: canManageTicketsMock,
}));

vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: queueTicketNotificationMock,
}));

vi.mock("@/lib/assigned-work-access", () => ({
  isAssignedWorkAccessible: isAssignedWorkAccessibleMock,
}));

vi.mock("@/lib/schema-readiness", () => ({
  isMissingSchemaColumnError: isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessage: schemaMismatchUserMessageMock,
}));

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

const user = {
  id: "user-1",
  company_id: "company-1",
  role: "admin",
  name: "Anna Admin",
  email: "anna@example.se",
};

const comment = {
  id: "comment-1",
  body: "Kontroll utförd",
  is_internal: true,
  created_at: new Date("2026-07-27T20:00:00Z"),
  author_type: "staff",
  author_name: "Anna Admin",
  author_email: "anna@example.se",
  user: { name: "Anna Admin", email: "anna@example.se" },
};

function request(body: unknown, requestId = "request-1") {
  return new Request("https://www.revalta.se/api/tickets/ticket-1/comments", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

function context() {
  return { params: Promise.resolve({ id: "ticket-1" }) };
}

describe("POST /api/tickets/[id]/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    getCurrentUserMock.mockResolvedValue(user);
    requireCompanyUserMock.mockReturnValue(user);
    canManageTicketsMock.mockReturnValue(true);
    isAssignedWorkAccessibleMock.mockReturnValue(true);
    isMissingSchemaColumnErrorMock.mockReturnValue(false);
    schemaMismatchUserMessageMock.mockReturnValue("Databasen uppdateras");
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Vattenläcka",
      assigned_to_id: "user-1",
    });
    ticketCommentCreateMock.mockResolvedValue(comment);
    auditLogCreateMock.mockResolvedValue({ id: "audit-1" });
    transactionMock.mockImplementation(async (callback) =>
      callback({
        ticketComment: { create: ticketCommentCreateMock },
        auditLog: { create: auditLogCreateMock },
      }),
    );
    queueTicketNotificationMock.mockResolvedValue(undefined);
  });

  it("fails closed before database access without a company user", async () => {
    requireCompanyUserMock.mockReturnValue(null);

    const response = await POST(request({ body: "Test" }), context());

    expect(response.status).toBe(401);
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("scopes the ticket and parent property to the verified company", async () => {
    await POST(request({ body: "Kontroll utförd", isInternal: true }), context());

    expect(ticketFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "ticket-1",
          company_id: "company-1",
          deleted_at: null,
          OR: expect.arrayContaining([
            { property_id: null },
            { property: { company_id: "company-1", deleted_at: null } },
          ]),
        }),
      }),
    );
  });

  it("creates the comment and audit record in the same transaction", async () => {
    const response = await POST(
      request({ body: "  Kontroll utförd  ", isInternal: true }),
      context(),
    );

    expect(response.status).toBe(201);
    expect(ticketCommentCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticket_id: "ticket-1",
          user_id: "user-1",
          body: "Kontroll utförd",
          is_internal: true,
        }),
      }),
    );
    expect(auditLogCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        company_id: "company-1",
        entity_id: "ticket-1",
        action: "ticket.comment_created",
        metadata: { commentId: "comment-1", isInternal: true },
      }),
    });
  });

  it("returns 201 when notification fails after the transaction", async () => {
    queueTicketNotificationMock.mockRejectedValue(new Error("provider unavailable"));

    const response = await POST(request({ body: "Kontroll utförd" }), context());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "ticket comment notification failed",
      expect.objectContaining({
        eventCode: "tickets.comments.create.partial_failure",
        ticketId: "ticket-1",
        commentId: "comment-1",
      }),
    );
  });

  it("returns a correlated no-store response", async () => {
    const response = await POST(
      request({ body: "Kontroll utförd" }, "request-comment-1"),
      context(),
    );

    expect(response.headers.get("x-request-id")).toBe("request-comment-1");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("does not include comment content in structured logs", async () => {
    await POST(request({ body: "Känslig intern kommentar", isInternal: true }), context());

    const serializedLogs = JSON.stringify([
      ...loggerInfoMock.mock.calls,
      ...loggerWarnMock.mock.calls,
      ...loggerErrorMock.mock.calls,
    ]);
    expect(serializedLogs).not.toContain("Känslig intern kommentar");
  });
});
