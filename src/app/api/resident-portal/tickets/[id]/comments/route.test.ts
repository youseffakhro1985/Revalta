import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkRateLimitMock,
  createLoggerMock,
  findAccessibleResidentPortalTicketMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  queueTicketNotificationMock,
  ticketCommentCreateMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  createLoggerMock: vi.fn(),
  findAccessibleResidentPortalTicketMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  queueTicketNotificationMock: vi.fn(),
  ticketCommentCreateMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/resident-portal-tickets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/resident-portal-tickets")>()),
  findAccessibleResidentPortalTicket: findAccessibleResidentPortalTicketMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/integrations", () => ({ queueTicketNotification: queueTicketNotificationMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

vi.mock("@/lib/db", () => ({
  default: {
    ticketComment: { create: ticketCommentCreateMock },
  },
}));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const residentUser = {
  id: "user-resident",
  company_id: "company-1",
  role: "resident",
  email: "boende@exempel.se",
  name: "Boende Test",
};
const ticket = {
  id: "ticket-1",
  company_id: "company-1",
  user_id: "owner-1",
  title: "Trasig port",
  reporter_name: "Boende Test",
  reporter_email: "boende@exempel.se",
  comments: [],
};

function request(body = "Porten är fortfarande trasig", ticketId = "ticket-1") {
  return new Request(`https://www.revalta.se/api/resident-portal/tickets/${ticketId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({ body }),
  });
}

describe("resident-portal ticket comments route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() });
    findAccessibleResidentPortalTicketMock.mockResolvedValue(ticket);
    writeAuditLogMock.mockResolvedValue(undefined);
    queueTicketNotificationMock.mockResolvedValue(undefined);
    ticketCommentCreateMock.mockResolvedValue({
      id: "comment-1",
      body: "Porten är fortfarande trasig",
      created_at: new Date("2026-07-02T09:00:00.000Z"),
      author_type: "resident",
      author_name: "Boende Test",
    });
  });

  it("lets a resident post a public comment with correlation and private caching", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);

    const response = await POST(request(), { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(body.comment).toMatchObject({
      id: "comment-1",
      body: "Porten är fortfarande trasig",
      author: { type: "resident", name: "Boende Test" },
    });
    expect(ticketCommentCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ticket_id: "ticket-1",
        is_internal: false,
        author_type: "resident",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      residentUser,
      expect.objectContaining({ action: "resident_portal.comment_created" }),
    );
    expect(queueTicketNotificationMock).toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "resident ticket comment created",
      expect.objectContaining({
        event: "resident_tickets.comments.completed",
        userId: "user-resident",
        companyId: "company-1",
        ticketId: "ticket-1",
        commentId: "comment-1",
        authorType: "resident",
      }),
    );
    const logged = JSON.stringify(loggerInfoMock.mock.calls);
    expect(logged).not.toContain("Porten är fortfarande trasig");
    expect(logged).not.toContain("Trasig port");
    expect(logged).not.toContain("boende@exempel.se");
    expect(logged).not.toContain("Boende Test");
  });

  it("returns correlated validation errors without logging comment text", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);

    const response = await POST(request("   "), { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "Kommentaren får inte vara tom",
      errorCode: "VALIDATION_FAILED",
      requestId,
    });
    expect(ticketCommentCreateMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("Porten");
  });

  it("denies viewers with a stable correlated 403", async () => {
    getCurrentUserMock.mockResolvedValue({ ...residentUser, role: "viewer" });

    const response = await POST(request("Hej"), { params: Promise.resolve({ id: "ticket-1" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Du saknar behörighet att kommentera",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(findAccessibleResidentPortalTicketMock).not.toHaveBeenCalled();
  });

  it("returns a stable correlated 429 before ticket access when rate limited", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    checkRateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });

    const response = await POST(request("Kommentar", "external-secret-ticket"), {
      params: Promise.resolve({ id: "external-secret-ticket" }),
    });
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({
      error: "För många kommentarer. Vänta en stund och prova igen.",
      errorCode: "RATE_LIMITED",
      requestId,
    });
    expect(findAccessibleResidentPortalTicketMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-secret-ticket");
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("Kommentar");
  });

  it("returns a correlated 404 without logging an unverified ticket id or comment body", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    findAccessibleResidentPortalTicketMock.mockResolvedValue(null);

    const response = await POST(request("Publik kommentar", "external-secret-ticket"), {
      params: Promise.resolve({ id: "external-secret-ticket" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: "Ärendet hittades inte",
      errorCode: "NOT_FOUND",
      requestId,
    });
    expect(ticketCommentCreateMock).not.toHaveBeenCalled();
    const logged = JSON.stringify(loggerWarnMock.mock.calls);
    expect(logged).not.toContain("external-secret-ticket");
    expect(logged).not.toContain("Publik kommentar");
  });

  it("returns a stable correlated 401 before rate limiting or ticket access", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await POST(request(), { params: Promise.resolve({ id: "ticket-1" }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Obehörig",
      errorCode: "UNAUTHORIZED",
      requestId,
    });
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(findAccessibleResidentPortalTicketMock).not.toHaveBeenCalled();
  });

  it("returns a safe correlated 500 without leaking dependency details", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("postgres://user:secret@db.internal/revalta"));

    const response = await POST(request(), { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "resident ticket comment create failed",
      expect.any(Error),
      expect.objectContaining({ event: "resident_tickets.comments.failed" }),
    );
  });
});
