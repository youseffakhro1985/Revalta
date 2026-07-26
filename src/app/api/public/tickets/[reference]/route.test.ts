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
      where: { public_reference: "RV-2026-TEST", reporter_email: "boende@example.se" },
      select: expect.objectContaining({
        comments: expect.objectContaining({
          where: { is_internal: false },
        }),
      }),
    }));
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ company_id: "company-1", entity_id: "ticket-1" }),
    }));
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
