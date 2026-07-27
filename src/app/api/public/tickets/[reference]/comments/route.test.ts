import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ticketFindFirstMock,
  transactionMock,
  commentCreateMock,
  auditCreateMock,
  checkRateLimitMock,
  getClientIpMock,
  extractTokenMock,
  verifyTokenMock,
  queueNotificationMock,
  schemaErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  ticketFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
  commentCreateMock: vi.fn(),
  auditCreateMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getClientIpMock: vi.fn(),
  extractTokenMock: vi.fn(),
  verifyTokenMock: vi.fn(),
  queueNotificationMock: vi.fn(),
  schemaErrorMock: vi.fn(),
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
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: getClientIpMock,
}));
vi.mock("@/lib/portal-tracking", () => ({
  extractPortalTrackingToken: extractTokenMock,
  verifyPortalTrackingToken: verifyTokenMock,
}));
vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: queueNotificationMock,
}));
vi.mock("@/lib/schema-readiness", () => ({
  isMissingSchemaColumnError: schemaErrorMock,
  schemaMismatchUserMessage: vi.fn(() => "Databasen är inte redo"),
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

const params = Promise.resolve({ reference: "rv-2026-test" });
const REQUEST_ID = "99999999-9999-4999-8999-999999999999";

function request(body: Record<string, unknown> = {}, rawBody?: string) {
  return new Request("https://www.revalta.se/api/public/tickets/RV-2026-TEST/comments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": REQUEST_ID,
    },
    body: rawBody ?? JSON.stringify({
      email: "boende@example.se",
      name: "Anna Boende",
      body: "Tack, felet kvarstår fortfarande.",
      ...body,
    }),
  });
}

const ticket = {
  id: "ticket-1",
  title: "Trasig port",
  company_id: "company-1",
  user_id: "owner-1",
  reporter_name: "Anna Boende",
  reporter_email: "boende@example.se",
};

const comment = {
  id: "comment-1",
  body: "Tack, felet kvarstår fortfarande.",
  created_at: new Date("2026-07-28T12:00:00.000Z"),
  author_type: "resident",
  author_name: "Anna Boende",
};

describe("POST /api/public/tickets/[reference]/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetAt: new Date(Date.now() + 60_000),
      source: "database",
    });
    getClientIpMock.mockReturnValue("127.0.0.1");
    extractTokenMock.mockReturnValue(null);
    verifyTokenMock.mockReturnValue(null);
    ticketFindFirstMock.mockResolvedValue(ticket);
    commentCreateMock.mockResolvedValue(comment);
    auditCreateMock.mockResolvedValue({ id: "audit-1" });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      ticketComment: { create: commentCreateMock },
      auditLog: { create: auditCreateMock },
    }));
    queueNotificationMock.mockResolvedValue(undefined);
    schemaErrorMock.mockReturnValue(false);
  });

  it("rate limits before parsing JSON or querying tickets", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
      source: "database",
    });

    const response = await POST(request({}, "not-json"), { params });
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.errorCode).toBe("RATE_LIMITED");
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("creates the public comment and audit record in one transaction", async () => {
    const response = await POST(request(), { params });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.comment.author).toEqual({ type: "resident", name: "Anna Boende" });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(commentCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ticket_id: "ticket-1",
        user_id: "owner-1",
        is_internal: false,
        author_type: "resident",
      }),
    }));
    expect(auditCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        actor_user_id: "owner-1",
        entity_id: "ticket-1",
        action: "public.comment_created",
      }),
    }));
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
  });

  it("binds a valid tracking token to reference, email and company", async () => {
    verifyTokenMock.mockReturnValue({
      reference: "RV-2026-TEST",
      email: "token@example.se",
      companyId: "company-token",
      exp: Date.now() + 60_000,
    });

    const response = await POST(request({ token: "signed-token", email: "ignored@example.se" }), { params });

    expect(response.status).toBe(201);
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        public_reference: "RV-2026-TEST",
        reporter_email: "token@example.se",
        company_id: "company-token",
      }),
    }));
  });

  it("returns the same neutral 404 for reference mismatch and missing tickets", async () => {
    verifyTokenMock.mockReturnValue({
      reference: "RV-2026-OTHER",
      email: "boende@example.se",
      companyId: "company-1",
      exp: Date.now() + 60_000,
    });

    const mismatch = await POST(request({ token: "signed-token" }), { params });
    const mismatchPayload = await mismatch.json();

    verifyTokenMock.mockReturnValue(null);
    ticketFindFirstMock.mockResolvedValue(null);
    const missing = await POST(request(), { params });
    const missingPayload = await missing.json();

    expect(mismatch.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(mismatchPayload.error).toBe(missingPayload.error);
    expect(mismatchPayload.errorCode).toBe("NOT_FOUND");
    expect(missingPayload.errorCode).toBe("NOT_FOUND");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 201 when notification fails after the atomic commit", async () => {
    queueNotificationMock.mockRejectedValue(new Error("mail unavailable"));

    const response = await POST(request(), { params });

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "public ticket comment notification failed",
      expect.objectContaining({
        eventCode: "public_tickets.comment.notification_failed",
        ticketId: "ticket-1",
      }),
    );
  });

  it("returns a safe schema readiness error", async () => {
    const schemaError = new Error("column author_name does not exist");
    ticketFindFirstMock.mockRejectedValue(schemaError);
    schemaErrorMock.mockReturnValue(true);

    const response = await POST(request(), { params });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.errorCode).toBe("SERVICE_UNAVAILABLE");
    expect(payload.error).toBe("Databasen är inte redo");
    expect(response.headers.get("cache-control")).toContain("private, no-store");
  });
});