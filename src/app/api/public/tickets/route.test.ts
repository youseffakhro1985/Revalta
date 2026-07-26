import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolvePublicPortalCompanyMock,
  ticketCreateMock,
  ticketFindUniqueMock,
  propertyFindFirstMock,
  analyzeTicketMock,
  createPortalTrackingTokenMock,
} = vi.hoisted(() => ({
  resolvePublicPortalCompanyMock: vi.fn(),
  ticketCreateMock: vi.fn(),
  ticketFindUniqueMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  analyzeTicketMock: vi.fn(),
  createPortalTrackingTokenMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { create: ticketCreateMock, findUnique: ticketFindUniqueMock },
    property: { findFirst: propertyFindFirstMock },
  },
}));

vi.mock("@/lib/public-portal", async () => {
  const actual = await vi.importActual<typeof import("@/lib/public-portal")>("@/lib/public-portal");
  return {
    ...actual,
    resolvePublicPortalCompany: resolvePublicPortalCompanyMock,
  };
});

vi.mock("@/lib/ai", () => ({ analyzeTicket: analyzeTicketMock }));
vi.mock("@/lib/portal-tracking", () => ({ createPortalTrackingToken: createPortalTrackingTokenMock }));
vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: vi.fn(),
  queueSmsNotification: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

import { POST } from "./route";

describe("POST /api/public/tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvePublicPortalCompanyMock.mockResolvedValue({
      company: { id: "company-1", name: "Demo" },
      owner: { id: "owner-1", email: "owner@example.com" },
    });
    analyzeTicketMock.mockResolvedValue({
      category: "plumbing",
      priority: "normal",
      summary: "Sammanfattning",
      recommendedAction: "Åtgärda",
      confidence: 0.8,
    });
    ticketFindUniqueMock.mockResolvedValue(null);
    ticketCreateMock.mockResolvedValue({
      id: "ticket-1",
      public_reference: "RV-2026-ABC123",
      title: "Läckage",
      status: "new",
      priority: "normal",
      category: "plumbing",
      created_at: new Date("2026-07-26T10:00:00.000Z"),
    });
    createPortalTrackingTokenMock.mockReturnValue("token-1");
  });

  it("skapar ärende med companySlug-scope", async () => {
    const response = await POST(new Request("https://www.revalta.se/api/public/tickets?companySlug=demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reporterName: "Anna Boende",
        reporterEmail: "anna@example.com",
        title: "Läckage i kök",
        description: "Det droppar under diskbänken sedan i morse.",
        companySlug: "demo",
      }),
    }));

    expect(response.status).toBe(201);
    expect(resolvePublicPortalCompanyMock).toHaveBeenCalledWith(expect.objectContaining({
      companySlug: "demo",
    }));
    expect(ticketCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        reporter_email: "anna@example.com",
      }),
    }));
  });

  it("avvisar när portalen inte kan resolvas", async () => {
    resolvePublicPortalCompanyMock.mockResolvedValue(null);
    const response = await POST(new Request("https://www.revalta.se/api/public/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reporterName: "Anna Boende",
        reporterEmail: "anna@example.com",
        title: "Läckage i kök",
        description: "Det droppar under diskbänken sedan i morse.",
      }),
    }));
    expect(response.status).toBe(503);
    expect(ticketCreateMock).not.toHaveBeenCalled();
  });
});
