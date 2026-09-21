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
vi.mock("@/lib/schema-readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema-readiness")>()),
  hasTicketAiSourceColumn: vi.fn(async () => true),
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
    expect(queueTicketNotificationMock).toHaveBeenCalledTimes(2);
    expect(queueTicketNotificationMock).toHaveBeenNthCalledWith(
      1,
      { company_id: "company-1" },
      expect.objectContaining({
        recipient: "anna@example.com",
        event: "created",
        emailContent: expect.objectContaining({
          text: expect.stringMatching(/https:\/\/www\.revalta\.se\/portal\?ref=RV-\d{4}-[A-Z0-9]+&token=token-1/),
        }),
      }),
    );
    expect(queueTicketNotificationMock).toHaveBeenNthCalledWith(
      2,
      { company_id: "company-1" },
      expect.objectContaining({
        recipient: "owner@example.com",
        event: "created",
        emailContent: expect.objectContaining({
          subject: expect.stringContaining("Ny felanmälan"),
        }),
      }),
    );
    expect(JSON.stringify(queueTicketNotificationMock.mock.calls[1])).not.toContain("token-1");
    expect(queueSmsNotificationMock).toHaveBeenCalledTimes(1);
    expect(queueSmsNotificationMock.mock.calls[0][1].message).toContain("https://www.revalta.se/portal");
    expect(queueSmsNotificationMock.mock.calls[0][1].message).not.toContain("token-1");
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

  it("accepts a native form post and redirects to the portal without putting the reporter email in the URL", async () => {
    const response = await POST(new Request("https://www.revalta.se/api/public/tickets?companySlug=demo", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "reporterName=Anna+Boende&reporterEmail=anna%40example.com&title=L%C3%A4ckage+i+k%C3%B6k&description=Det+droppar+under+diskb%C3%A4nken+sedan+i+morse.&companySlug=demo",
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://www.revalta.se/portal/demo?created=1&ref=RV-2026-ABC123&token=token-1",
    );
    expect(response.headers.get("location")).not.toContain("anna");
    expect(response.headers.get("location")).not.toContain("example.com");
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(ticketCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        reporter_email: "anna@example.com",
        title: "Läckage i kök",
      }),
    }));
  });

  it("returns the native form to the portal with a generic reason when the description is too short", async () => {
    const response = await POST(new Request("https://www.revalta.se/api/public/tickets?companySlug=demo", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "reporterName=Anna+Boende&reporterEmail=anna%40example.com&title=L%C3%A4ckage&description=kort&companySlug=demo",
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://www.revalta.se/portal/demo?reason=invalid");
    expect(response.headers.get("location")).not.toContain("anna");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns the native form to the portal when tracking is unavailable", async () => {
    hasPortalTrackingConfigMock.mockReturnValue(false);

    const response = await POST(new Request("https://www.revalta.se/api/public/tickets?companySlug=demo", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "reporterName=Anna+Boende&reporterEmail=anna%40example.com&title=L%C3%A4ckage+i+k%C3%B6k&description=Det+droppar+under+diskb%C3%A4nken+sedan+i+morse.&companySlug=demo",
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://www.revalta.se/portal/demo?reason=unavailable");
    expect(analyzeTicketMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when a public ticket uses a property outside the portal tenant", async () => {
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await POST(publicTicketRequest({ propertyId: "property-tenant-b" }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Vald fastighet hittades inte");
    expect(propertyFindFirstMock).toHaveBeenCalledWith({
      where: { id: "property-tenant-b", company_id: "company-1", status: "active", deleted_at: null },
      select: { id: true, name: true, address: true, city: true },
    });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(ticketCreateMock).not.toHaveBeenCalled();
  });
});
