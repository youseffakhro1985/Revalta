import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  ticketFindFirstMock,
  ticketCommentCreateMock,
  writeAuditLogMock,
  queueTicketNotificationMock,
  checkRateLimitMock,
  getClientIpMock,
  verifyPortalTrackingTokenMock,
  extractPortalTrackingTokenMock,
} = vi.hoisted(() => ({
  ticketFindFirstMock: vi.fn(),
  ticketCommentCreateMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  queueTicketNotificationMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getClientIpMock: vi.fn(),
  verifyPortalTrackingTokenMock: vi.fn(),
  extractPortalTrackingTokenMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    ticketComment: { create: ticketCommentCreateMock },
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

import { POST } from "./route";

const params = Promise.resolve({ reference: "rv-2026-test" });

function makeRequest(body: unknown) {
  return new Request("https://www.revalta.se/api/public/tickets/RV-2026-TEST/comments", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("public tickets/[reference]/comments POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ allowed: true });
    getClientIpMock.mockReturnValue("127.0.0.1");
    verifyPortalTrackingTokenMock.mockReturnValue(null);
    extractPortalTrackingTokenMock.mockReturnValue(null);
    writeAuditLogMock.mockResolvedValue(undefined);
    queueTicketNotificationMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a public, non-internal comment scoped to the matching ticket only", async () => {
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Trasig port",
      company_id: "company-1",
      user_id: "staff-1",
      reporter_name: "Boende",
      reporter_email: "boende@example.se",
    });
    ticketCommentCreateMock.mockResolvedValue({
      id: "comment-1",
      body: "Tack för uppdateringen",
      created_at: new Date("2026-08-01T10:00:00Z"),
      author_type: "resident",
      author_name: "Boende",
    });

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

    // Looked up by reference AND reporter email, scoping strictly to the owning ticket.
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

    // Created comment is always forced to public/non-internal, and tied to the found ticket.
    expect(ticketCommentCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticket_id: "ticket-1",
        is_internal: false,
        author_type: "resident",
      }),
      select: expect.any(Object),
    });
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      { company_id: "company-1" },
      expect.objectContaining({ ticketId: "ticket-1", event: "commented" }),
    );
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
    expect(ticketCommentCreateMock).not.toHaveBeenCalled();
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
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Trasig port",
      company_id: "company-1",
      user_id: "staff-1",
      reporter_name: "Boende",
      reporter_email: "boende@example.se",
    });
    ticketCommentCreateMock.mockResolvedValue({
      id: "comment-2",
      body: "Med token",
      created_at: new Date("2026-08-01T10:00:00Z"),
      author_type: "resident",
      author_name: "Boende",
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
    expect(ticketCommentCreateMock).not.toHaveBeenCalled();
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
