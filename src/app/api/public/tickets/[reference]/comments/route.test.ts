import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  ticketFindFirstMock,
  ticketCommentCreateMock,
  transactionMock,
  writeAuditLogMock,
  queueTicketNotificationMock,
  checkRateLimitMock,
  getClientIpMock,
  verifyPortalTrackingTokenMock,
  extractPortalTrackingTokenMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  ticketFindFirstMock: vi.fn(),
  ticketCommentCreateMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  queueTicketNotificationMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getClientIpMock: vi.fn(),
  verifyPortalTrackingTokenMock: vi.fn(),
  extractPortalTrackingTokenMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    $transaction: transactionMock,
  },
}));
vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));
vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: queueTicketNotificationMock,
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: getClientIpMock,
}));
vi.mock("@/lib/portal-tracking", () => ({
  verifyPortalTrackingToken: verifyPortalTrackingTokenMock,
  extractPortalTrackingToken: extractPortalTrackingTokenMock,
}));
vi.mock("@/lib/structured-logger", () => ({
  createLogger: () => ({ error: loggerErrorMock, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { POST } from "./route";

const params = Promise.resolve({ reference: "rv-2026-test" });

function makeRequest(body: unknown) {
  return new Request("https://www.revalta.se/api/public/tickets/RV-2026-TEST/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const matchedTicket = {
  id: "ticket-1",
  title: "Trasig port",
  company_id: "company-1",
  user_id: "staff-1",
  reporter_name: "Boende",
  reporter_email: "boende@example.se",
};
const createdComment = {
  id: "comment-1",
  body: "Tack för uppdateringen",
  created_at: new Date("2026-08-01T10:00:00Z"),
  author_type: "resident",
  author_name: "Boende",
};

describe("public tickets/[reference]/comments POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ allowed: true });
    getClientIpMock.mockReturnValue("127.0.0.1");
    verifyPortalTrackingTokenMock.mockReturnValue(null);
    extractPortalTrackingTokenMock.mockReturnValue(null);
    writeAuditLogMock.mockResolvedValue(undefined);
    queueTicketNotificationMock.mockResolvedValue(undefined);
    ticketFindFirstMock.mockResolvedValue(matchedTicket);
    ticketCommentCreateMock.mockResolvedValue(createdComment);
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      ticketComment: { create: ticketCommentCreateMock },
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a public, non-internal comment and audit atomically for the matching ticket", async () => {
    const response = await POST(
      makeRequest({ email: "boende@example.se", name: "Boende", body: "Tack för uppdateringen" }),
      { params },
    );
    const responseBody = await response.json();

    expect(response.status).toBe(201);
    expect(responseBody.success).toBe(true);
    expect(responseBody.comment).toEqual({
      id: "comment-1",
      body: "Tack för uppdateringen",
      created_at: "2026-08-01T10:00:00.000Z",
      author: { type: "resident", name: "Boende" },
    });

    expect(ticketFindFirstMock).toHaveBeenCalledWith({
      where: {
        public_reference: "RV-2026-TEST",
        reporter_email: "boende@example.se",
        deleted_at: null,
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
      select: {
        id: true,
        title: true,
        company_id: true,
        user_id: true,
        reporter_name: true,
        reporter_email: true,
      },
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(ticketCommentCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticket_id: "ticket-1",
        is_internal: false,
        author_type: "resident",
      }),
      select: expect.any(Object),
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      { id: "staff-1", company_id: "company-1" },
      expect.objectContaining({
        action: "public.comment_created",
        metadata: { commentId: "comment-1", authorType: "resident", schemaVersion: 2 },
      }),
      expect.objectContaining({ ticketComment: { create: ticketCommentCreateMock } }),
    );
    expect(JSON.stringify(writeAuditLogMock.mock.calls)).not.toContain("boende@example.se");
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      { company_id: "company-1" },
      expect.objectContaining({ ticketId: "ticket-1", event: "commented" }),
    );
  });

  it("returns 201 after commit even when notification delivery/journaling fails", async () => {
    queueTicketNotificationMock.mockRejectedValue(new Error("email unavailable"));

    const response = await POST(
      makeRequest({ email: "boende@example.se", body: "Tack för uppdateringen" }),
      { params },
    );

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock).toHaveBeenCalledWith("Public comment notification failed", expect.any(Error));
  });

  it("returns 500 and does not notify when the comment+audit transaction fails", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    const response = await POST(
      makeRequest({ email: "boende@example.se", body: "Tack för uppdateringen" }),
      { params },
    );

    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(queueTicketNotificationMock).not.toHaveBeenCalled();
  });

  it("returns a generic 404 (no info leak) when the reference does not match any ticket", async () => {
    ticketFindFirstMock.mockResolvedValue(null);

    const response = await POST(
      makeRequest({ email: "attacker@example.se", body: "Guessing reference" }),
      { params },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Ärendet hittades inte. Kontrollera referensnummer och e-post.");
    expect(transactionMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("scopes the lookup by tracking token's company_id, rejecting a cross-tenant token/reference mismatch", async () => {
    verifyPortalTrackingTokenMock.mockReturnValue({
      reference: "RV-2026-OTHER",
      email: "boende@example.se",
      companyId: "company-2",
      exp: Date.now() + 1_000_000,
    });

    const response = await POST(
      makeRequest({ token: "signed-token", body: "Trying another company's ticket" }),
      { params },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Ogiltig spårningstoken");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("includes company_id from a valid tracking token in the ticket lookup", async () => {
    verifyPortalTrackingTokenMock.mockReturnValue({
      reference: "RV-2026-TEST",
      email: "boende@example.se",
      companyId: "company-1",
      exp: Date.now() + 1_000_000,
    });

    const response = await POST(
      makeRequest({ token: "signed-token", body: "Med token" }),
      { params },
    );

    expect(response.status).toBe(201);
    expect(ticketFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ company_id: "company-1" }),
      }),
    );
  });

  it("returns 429 when rate limited before touching the database", async () => {
    checkRateLimitMock.mockResolvedValue({ allowed: false });

    const response = await POST(
      makeRequest({ email: "boende@example.se", body: "Spam attempt" }),
      { params },
    );

    expect(response.status).toBe(429);
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 400 when email/token or body is missing", async () => {
    const response = await POST(makeRequest({ email: "boende@example.se", body: "" }), { params });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("E-post eller spårningstoken och kommentar krävs");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns 400 when fields exceed their length limits", async () => {
    const response = await POST(
      makeRequest({ email: "boende@example.se", body: "a".repeat(5_001) }),
      { params },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("En eller flera uppgifter är för långa");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns 500 without leaking internals when an unexpected error occurs", async () => {
    ticketFindFirstMock.mockRejectedValue(new Error("db unavailable"));

    const response = await POST(
      makeRequest({ email: "boende@example.se", body: "Hej" }),
      { params },
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Internt serverfel");
  });
});
