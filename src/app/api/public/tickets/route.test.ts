import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolvePublicPortalCompanyMock,
  ticketCreateMock,
  ticketFindUniqueMock,
  propertyFindFirstMock,
  transactionMock,
  analyzeTicketMock,
  createPortalTrackingTokenMock,
  hasPortalTrackingConfigMock,
  writeAuditLogMock,
  queueTicketNotificationMock,
  queueSmsNotificationMock,
} = vi.hoisted(() => ({
  resolvePublicPortalCompanyMock: vi.fn(),
  ticketCreateMock: vi.fn(),
  ticketFindUniqueMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
  analyzeTicketMock: vi.fn(),
  createPortalTrackingTokenMock: vi.fn(),
  hasPortalTrackingConfigMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  queueTicketNotificationMock: vi.fn(),
  queueSmsNotificationMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findUnique: ticketFindUniqueMock },
    property: { findFirst: propertyFindFirstMock },
    $transaction: transactionMock,
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
vi.mock("@/lib/portal-tracking", () => ({
  createPortalTrackingToken: createPortalTrackingTokenMock,
  hasPortalTrackingConfig: hasPortalTrackingConfigMock,
}));
vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: queueTicketNotificationMock,
  queueSmsNotification: queueSmsNotificationMock,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

import { POST } from "./route";

function publicTicketRequest(extra: Record<string, unknown> = {}) {
  return new Request("https://www.revalta.se/api/public/tickets?companySlug=demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reporterName: "Anna Boende",
      reporterEmail: "anna@example.com",
      title: "Läckage i kök",
      description: "Det droppar under diskbänken sedan i morse.",
      companySlug: "demo",
      ...extra,
    }),
  });
}

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
      reporter_email: "anna@example.com",
      created_at: new Date("2026-07-26T10:00:00.000Z"),
      property: null,
    });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      ticket: { create: ticketCreateMock },
    }));
    createPortalTrackingTokenMock.mockReturnValue("token-1");
    hasPortalTrackingConfigMock.mockReturnValue(true);
    writeAuditLogMock.mockResolvedValue(undefined);
    queueTicketNotificationMock.mockResolvedValue(undefined);
    queueSmsNotificationMock.mockResolvedValue(undefined);
  });

  it("skapar ärende och audit atomiskt med companySlug-scope", async () => {
    const response = await POST(publicTicketRequest());

    expect(response.status).toBe(201);
    expect(resolvePublicPortalCompanyMock).toHaveBeenCalledWith(expect.objectContaining({ companySlug: "demo" }));
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(ticketCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        reporter_email: "anna@example.com",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      { id: "owner-1", company_id: "company-1" },
      expect.objectContaining({
        action: "public.ticket_created",
        metadata: expect.objectContaining({ source: "public_portal" }),
      }),
      expect.objectContaining({ ticket: { create: ticketCreateMock } }),
    );
    expect(JSON.stringify(writeAuditLogMock.mock.calls)).not.toContain("anna@example.com");
  });

  it("avvisar innan AI eller mutation när tracking-signering inte är konfigurerad", async () => {
    hasPortalTrackingConfigMock.mockReturnValue(false);

    const response = await POST(publicTicketRequest());

    expect(response.status).toBe(503);
    expect(analyzeTicketMock).not.toHaveBeenCalled();
    expect(createPortalTrackingTokenMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(queueTicketNotificationMock).not.toHaveBeenCalled();
  });

  it("returnerar 201 efter commit även om e-post och SMS-journal/leverans kastar", async () => {
    queueTicketNotificationMock.mockRejectedValue(new Error("email unavailable"));
    queueSmsNotificationMock.mockRejectedValue(new Error("sms unavailable"));

    const response = await POST(publicTicketRequest({ reporterPhone: "+46701234567" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ success: true, trackingToken: "token-1", ticket: { id: "ticket-1" } });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(queueTicketNotificationMock).toHaveBeenCalledTimes(1);
    expect(queueSmsNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("returnerar 500 och skickar inga notifieringar när ticket+audit-transaktionen faller", async () => {
    transactionMock.mockRejectedValue(new Error("audit transaction failed"));

    const response = await POST(publicTicketRequest());

    expect(response.status).toBe(500);
    expect(queueTicketNotificationMock).not.toHaveBeenCalled();
    expect(queueSmsNotificationMock).not.toHaveBeenCalled();
  });

  it("avvisar när portalen inte kan resolvas", async () => {
    resolvePublicPortalCompanyMock.mockResolvedValue(null);
    const response = await POST(publicTicketRequest());
    expect(response.status).toBe(503);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
