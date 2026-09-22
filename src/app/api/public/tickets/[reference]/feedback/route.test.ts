import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ticketFindFirstMock,
  auditFindFirstMock,
  writeAuditLogMock,
  checkRateLimitMock,
  getClientIpMock,
  verifyPortalTrackingTokenMock,
  extractPortalTrackingTokenMock,
} = vi.hoisted(() => ({
  ticketFindFirstMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getClientIpMock: vi.fn(),
  verifyPortalTrackingTokenMock: vi.fn(),
  extractPortalTrackingTokenMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    auditLog: { findFirst: auditFindFirstMock },
  },
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
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
  return new Request("https://www.revalta.se/api/public/tickets/RV-2026-TEST/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/public/tickets/[reference]/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ allowed: true });
    getClientIpMock.mockReturnValue("127.0.0.1");
    verifyPortalTrackingTokenMock.mockReturnValue(null);
    extractPortalTrackingTokenMock.mockReturnValue(null);
    writeAuditLogMock.mockResolvedValue(undefined);
    auditFindFirstMock.mockResolvedValue(null);
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      status: "closed",
      company_id: "company-1",
      user_id: "staff-1",
      public_reference: "RV-2026-TEST",
    });
  });

  it("stores one resident rating in audit without reporter email", async () => {
    const response = await POST(makeRequest({ email: "boende@example.se", rating: 5, comment: "Snabbt åtgärdat" }), { params });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.feedback).toEqual(expect.objectContaining({ rating: 5, comment: "Snabbt åtgärdat" }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      { id: "staff-1", company_id: "company-1" },
      expect.objectContaining({
        entityType: "ticket",
        entityId: "ticket-1",
        action: "ticket.resident_feedback",
        metadata: expect.objectContaining({
          rating: 5,
          comment: "Snabbt åtgärdat",
          source: "public_portal",
        }),
      }),
    );
    expect(JSON.stringify(writeAuditLogMock.mock.calls)).not.toContain("boende@example.se");
  });

  it("rejects a second rating for the same ticket", async () => {
    auditFindFirstMock.mockResolvedValue({
      metadata: { rating: 4, comment: "Redan lämnad" },
      created_at: new Date("2026-09-01T10:00:00.000Z"),
    });

    const response = await POST(makeRequest({ email: "boende@example.se", rating: 1 }), { params });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("redan lämnad");
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects feedback before the ticket is closed", async () => {
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      status: "in_progress",
      company_id: "company-1",
      user_id: "staff-1",
      public_reference: "RV-2026-TEST",
    });

    const response = await POST(makeRequest({ email: "boende@example.se", rating: 5 }), { params });
    expect(response.status).toBe(409);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns 400 when rating is missing", async () => {
    const response = await POST(makeRequest({ email: "boende@example.se" }), { params });
    expect(response.status).toBe(400);
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when a Tenant A portal token looks up a Tenant B reference", async () => {
    ticketFindFirstMock.mockResolvedValue(null);
    verifyPortalTrackingTokenMock.mockReturnValue({
      reference: "RV-TENANT-B",
      email: "boende@example.se",
      companyId: "company-1",
      exp: Date.now() + 1_000_000,
    });

    const response = await POST(
      makeRequest({ token: "signed-token", rating: 5 }),
      { params: Promise.resolve({ reference: "rv-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Ärendet hittades inte. Kontrollera referensnummer och e-post.");
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        public_reference: "RV-TENANT-B",
        reporter_email: "boende@example.se",
        company_id: "company-1",
      }),
    }));
    expect(writeAuditLogMock).not.toHaveBeenCalled();
    expect(auditFindFirstMock).not.toHaveBeenCalled();
  });

  it("accepts a native form post and redirects without putting the reporter email in the URL", async () => {
    const response = await POST(
      new Request("https://www.revalta.se/api/public/tickets/RV-2026-TEST/feedback?companySlug=demo", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=boende%40example.se&rating=5&comment=Snabbt+åtgärdat&companySlug=demo",
      }),
      { params },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://www.revalta.se/portal/demo?feedback=1&ref=RV-2026-TEST",
    );
    expect(response.headers.get("location")).not.toContain("boende");
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
  });

  it("returns the native form to the portal when rating is missing", async () => {
    const response = await POST(
      new Request("https://www.revalta.se/api/public/tickets/RV-2026-TEST/feedback?companySlug=demo", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=boende%40example.se&comment=Hej&companySlug=demo",
      }),
      { params },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://www.revalta.se/portal/demo?reason=invalid&ref=RV-2026-TEST",
    );
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
