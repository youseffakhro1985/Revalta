import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ticketFindFirstMock, auditFindManyMock, checkRateLimitMock, getClientIpMock } = vi.hoisted(() => ({
  ticketFindFirstMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getClientIpMock: vi.fn(),
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

import { GET } from "./route";

const params = Promise.resolve({ reference: "rv-2026-test" });

describe("public ticket tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("JWT_SECRET", "test-jwt-secret-with-at-least-32-chars");
    checkRateLimitMock.mockResolvedValue({ allowed: true });
    getClientIpMock.mockReturnValue("127.0.0.1");
    auditFindManyMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires reference and matching email, and only selects public comments", async () => {
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      company_id: "company-1",
      reporter_name: "Boende",
      reporter_email: "boende@example.se",
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
    });

    const response = await GET(
      new Request("https://www.revalta.se/api/public/tickets/RV-2026-TEST?email=boende@example.se"),
      { params },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.trackingToken).toBe("string");
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { public_reference: "RV-2026-TEST", reporter_email: "boende@example.se", deleted_at: null },
      select: expect.objectContaining({
        comments: expect.objectContaining({
          where: { is_internal: false },
        }),
      }),
    }));
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("falls back to AuditLog authors only for legacy comments missing author_name", async () => {
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      company_id: "company-1",
      reporter_name: "Boende",
      reporter_email: "boende@example.se",
      public_reference: "RV-2026-TEST",
      title: "Trasig port",
      status: "new",
      priority: "normal",
      category: "other",
      created_at: new Date("2026-07-01T10:00:00Z"),
      updated_at: new Date("2026-07-01T10:00:00Z"),
      ai_summary: null,
      property: null,
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
    });
    auditFindManyMock.mockResolvedValue([
      { metadata: { commentId: "comment-legacy", reporterName: "Legacy Boende" } },
    ]);

    const response = await GET(
      new Request("https://www.revalta.se/api/public/tickets/RV-2026-TEST?email=boende@example.se"),
      { params },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ticket.comments).toEqual([
      {
        id: "comment-modern",
        body: "Modern",
        created_at: "2026-07-01T11:00:00.000Z",
        author: { type: "resident", name: "Anna" },
      },
      {
        id: "comment-legacy",
        body: "Legacy",
        created_at: "2026-07-01T12:00:00.000Z",
        author: { type: "resident", name: "Legacy Boende" },
      },
    ]);
    expect(auditFindManyMock).toHaveBeenCalled();
  });

  it("rejects tickets without company scope", async () => {
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      company_id: null,
      public_reference: "RV-2026-TEST",
      comments: [],
    });

    const response = await GET(
      new Request("https://www.revalta.se/api/public/tickets/RV-2026-TEST?email=boende@example.se"),
      { params },
    );

    expect(response.status).toBe(404);
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });
});
