import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ticketFindFirstMock,
  auditFindManyMock,
  checkRateLimitMock,
  getClientIpMock,
  extractPortalTrackingTokenMock,
  verifyPortalTrackingTokenMock,
  createPortalTrackingTokenMock,
  isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessageMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  ticketFindFirstMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getClientIpMock: vi.fn(),
  extractPortalTrackingTokenMock: vi.fn(),
  verifyPortalTrackingTokenMock: vi.fn(),
  createPortalTrackingTokenMock: vi.fn(),
  isMissingSchemaColumnErrorMock: vi.fn(),
  schemaMismatchUserMessageMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: getClientIpMock,
}));
vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    auditLog: { findMany: auditFindManyMock },
  },
}));
vi.mock("@/lib/portal-tracking", () => ({
  extractPortalTrackingToken: extractPortalTrackingTokenMock,
  verifyPortalTrackingToken: verifyPortalTrackingTokenMock,
  createPortalTrackingToken: createPortalTrackingTokenMock,
}));
vi.mock("@/lib/schema-readiness", () => ({
  isMissingSchemaColumnError: isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessage: schemaMismatchUserMessageMock,
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET } from "./route";

const params = Promise.resolve({ reference: "rv-2026-test" });

function request(query = "?email=boende@example.se") {
  return new Request(`https://www.revalta.se/api/public/tickets/RV-2026-TEST${query}`, {
    headers: { "x-request-id": "track-request-1" },
  });
}

function ticket(overrides: Record<string, unknown> = {}) {
  return {
    id: "ticket-1",
    company_id: "company-1",
    reporter_name: "Boende",
    public_reference: "RV-2026-TEST",
    title: "Trasig port",
    status: "new",
    priority: "normal",
    category: "other",
    created_at: new Date("2026-07-01T10:00:00Z"),
    updated_at: new Date("2026-07-01T10:00:00Z"),
    ai_summary: null,
    property: null,
    comments: [],
    attachments: [],
    ...overrides,
  };
}

describe("GET /api/public/tickets/[reference]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 19,
      resetAt: new Date(Date.now() + 60_000),
      source: "database",
    });
    getClientIpMock.mockReturnValue("127.0.0.1");
    extractPortalTrackingTokenMock.mockReturnValue(null);
    verifyPortalTrackingTokenMock.mockReturnValue(null);
    createPortalTrackingTokenMock.mockReturnValue("rotated-token");
    ticketFindFirstMock.mockResolvedValue(ticket());
    auditFindManyMock.mockResolvedValue([]);
    isMissingSchemaColumnErrorMock.mockReturnValue(false);
    schemaMismatchUserMessageMock.mockReturnValue("Databasen är inte redo");
  });

  it("rate limits before parsing identifiers or querying the database", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
      source: "database",
    });

    const response = await GET(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.errorCode).toBe("RATE_LIMITED");
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("scopes legacy email tracking and selects bounded public comments and attachments", async () => {
    const response = await GET(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.trackingToken).toBe("rotated-token");
    expect(response.headers.get("x-request-id")).toBe("track-request-1");
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        public_reference: "RV-2026-TEST",
        reporter_email: "boende@example.se",
        deleted_at: null,
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
      select: expect.objectContaining({
        comments: expect.objectContaining({
          where: { is_internal: false },
          take: 200,
          orderBy: [{ created_at: "asc" }, { id: "asc" }],
        }),
        attachments: {
          where: { visibility: "public" },
          take: 100,
          orderBy: [{ created_at: "asc" }, { id: "asc" }],
          select: {
            id: true,
            file_name: true,
            content_type: true,
            size_bytes: true,
            created_at: true,
          },
        },
      }),
    }));
    expect(createPortalTrackingTokenMock).toHaveBeenCalledWith({
      reference: "RV-2026-TEST",
      email: "boende@example.se",
      companyId: "company-1",
    });
  });

  it("returns safe public attachment metadata without storage URLs", async () => {
    ticketFindFirstMock.mockResolvedValue(ticket({
      attachments: [{
        id: "attachment_123",
        file_name: "skada bild.jpg",
        content_type: "image/jpeg",
        size_bytes: 1234,
        created_at: new Date("2026-07-01T13:00:00Z"),
      }],
    }));

    const response = await GET(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ticket.attachments).toEqual([{
      id: "attachment_123",
      file_name: "skada bild.jpg",
      content_type: "image/jpeg",
      size_bytes: 1234,
      created_at: "2026-07-01T13:00:00.000Z",
      download_url: "/api/public/tickets/RV-2026-TEST/attachments/attachment_123",
    }]);
    expect(JSON.stringify(body)).not.toContain("data_url");
    expect(JSON.stringify(body)).not.toContain("blob");
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "public ticket tracking succeeded",
      expect.objectContaining({ attachmentCount: 1 }),
    );
  });

  it("binds a valid tracking token to reference, email and company", async () => {
    extractPortalTrackingTokenMock.mockReturnValue("signed-token");
    verifyPortalTrackingTokenMock.mockReturnValue({
      reference: "RV-2026-TEST",
      email: "boende@example.se",
      companyId: "company-1",
      exp: Date.now() + 60_000,
    });

    const response = await GET(request(""), { params });

    expect(response.status).toBe(200);
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        public_reference: "RV-2026-TEST",
        reporter_email: "boende@example.se",
        company_id: "company-1",
      }),
    }));
  });

  it("returns the same neutral 404 for malformed input, token mismatch and missing ticket", async () => {
    const malformed = await GET(
      new Request("https://www.revalta.se/api/public/tickets/invalid?email=not-an-email"),
      { params: Promise.resolve({ reference: "invalid" }) },
    );
    expect(malformed.status).toBe(404);
    expect(ticketFindFirstMock).not.toHaveBeenCalled();

    verifyPortalTrackingTokenMock.mockReturnValue({
      reference: "RV-2026-OTHER",
      email: "boende@example.se",
      companyId: "company-1",
      exp: Date.now() + 60_000,
    });
    extractPortalTrackingTokenMock.mockReturnValue("signed-token");
    const mismatch = await GET(request(""), { params });
    expect(mismatch.status).toBe(404);
    expect(ticketFindFirstMock).not.toHaveBeenCalled();

    verifyPortalTrackingTokenMock.mockReturnValue(null);
    extractPortalTrackingTokenMock.mockReturnValue(null);
    ticketFindFirstMock.mockResolvedValue(null);
    const missing = await GET(request(), { params });
    expect(missing.status).toBe(404);

    const mismatchBody = await mismatch.json();
    const missingBody = await missing.json();
    expect(mismatchBody.error).toBe(missingBody.error);
    expect(mismatchBody.errorCode).toBe("NOT_FOUND");
    expect(missingBody.errorCode).toBe("NOT_FOUND");
  });

  it("falls back to audit authors only for legacy public comments", async () => {
    ticketFindFirstMock.mockResolvedValue(ticket({
      comments: [
        {
          id: "comment-modern",
          body: "Modern",
          created_at: new Date("2026-07-01T11:00:00Z"),
          author_type: "resident",
          author_name: "Anna",
          user: { name: "Ignored" },
        },
        {
          id: "comment-legacy",
          body: "Legacy",
          created_at: new Date("2026-07-01T12:00:00Z"),
          author_type: "staff",
          author_name: null,
          user: { name: "Förvaltningen" },
        },
      ],
    }));
    auditFindManyMock.mockResolvedValue([
      { metadata: { commentId: "comment-legacy", reporterName: "Legacy Boende" } },
    ]);

    const response = await GET(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ticket.comments[0].author).toEqual({ type: "resident", name: "Anna" });
    expect(body.ticket.comments[1].author).toEqual({ type: "resident", name: "Legacy Boende" });
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-1",
        entity_id: "ticket-1",
        action: "public.comment_created",
      }),
    }));
  });

  it("fails closed when a ticket has no company scope", async () => {
    ticketFindFirstMock.mockResolvedValue(ticket({ company_id: null }));

    const response = await GET(request(), { params });

    expect(response.status).toBe(404);
    expect(auditFindManyMock).not.toHaveBeenCalled();
    expect(createPortalTrackingTokenMock).not.toHaveBeenCalled();
  });

  it("returns a safe 503 for schema-readiness failures", async () => {
    const schemaError = new Error("column author_name does not exist");
    ticketFindFirstMock.mockRejectedValue(schemaError);
    isMissingSchemaColumnErrorMock.mockReturnValue(true);

    const response = await GET(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.errorCode).toBe("SERVICE_UNAVAILABLE");
    expect(schemaMismatchUserMessageMock).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "public ticket tracking schema unavailable",
      schemaError,
      expect.objectContaining({ eventCode: "public_tickets.track.schema_unavailable" }),
    );
  });
});
