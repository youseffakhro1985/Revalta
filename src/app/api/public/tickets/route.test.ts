import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolvePublicPortalCompanyMock,
  extractPortalCompanySlugMock,
  generatePublicReferenceMock,
  transactionMock,
  ticketCreateMock,
  auditCreateMock,
  propertyFindFirstMock,
  analyzeTicketMock,
  createPortalTrackingTokenMock,
  checkRateLimitMock,
  queueTicketNotificationMock,
  queueSmsNotificationMock,
  isMissingSchemaColumnErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  resolvePublicPortalCompanyMock: vi.fn(),
  extractPortalCompanySlugMock: vi.fn(),
  generatePublicReferenceMock: vi.fn(),
  transactionMock: vi.fn(),
  ticketCreateMock: vi.fn(),
  auditCreateMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  analyzeTicketMock: vi.fn(),
  createPortalTrackingTokenMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  queueTicketNotificationMock: vi.fn(),
  queueSmsNotificationMock: vi.fn(),
  isMissingSchemaColumnErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    $transaction: transactionMock,
    property: { findFirst: propertyFindFirstMock },
  },
}));

vi.mock("@/lib/public-portal", () => ({
  resolvePublicPortalCompany: resolvePublicPortalCompanyMock,
  extractPortalCompanySlug: extractPortalCompanySlugMock,
  generatePublicReference: generatePublicReferenceMock,
}));
vi.mock("@/lib/ai", () => ({ analyzeTicket: analyzeTicketMock }));
vi.mock("@/lib/portal-tracking", () => ({ createPortalTrackingToken: createPortalTrackingTokenMock }));
vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: queueTicketNotificationMock,
  queueSmsNotification: queueSmsNotificationMock,
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("@/lib/sla", () => ({ calculateDueDate: vi.fn(() => new Date("2026-07-28T10:00:00.000Z")) }));
vi.mock("@/lib/schema-readiness", () => ({
  isMissingSchemaColumnError: isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessage: "Databasen är inte redo",
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

function request(body: Record<string, unknown> = {}) {
  return new Request("https://www.revalta.se/api/public/tickets?companySlug=demo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": "public-request-1",
    },
    body: JSON.stringify({
      reporterName: "Anna Boende",
      reporterEmail: "anna@example.com",
      reporterPhone: "+46700000000",
      title: "Läckage i kök",
      description: "Det droppar under diskbänken sedan i morse.",
      companySlug: "demo",
      ...body,
    }),
  });
}

const createdTicket = {
  id: "ticket-1",
  public_reference: "RV-2026-ABC123",
  title: "Läckage i kök",
  status: "new",
  priority: "normal",
  category: "vvs",
  reporter_email: "anna@example.com",
  created_at: new Date("2026-07-26T10:00:00.000Z"),
  property: null,
};

describe("POST /api/public/tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date(Date.now() + 60_000),
      source: "database",
    });
    extractPortalCompanySlugMock.mockReturnValue("demo");
    resolvePublicPortalCompanyMock.mockResolvedValue({
      company: { id: "company-1", name: "Demo" },
      owner: { id: "owner-1", email: "owner@example.com" },
    });
    analyzeTicketMock.mockResolvedValue({
      category: "vvs",
      priority: "normal",
      summary: "Sammanfattning",
      recommendedAction: "Åtgärda",
      confidence: 0.8,
    });
    generatePublicReferenceMock.mockReturnValue("RV-2026-ABC123");
    createPortalTrackingTokenMock.mockReturnValue("token-1");
    ticketCreateMock.mockResolvedValue(createdTicket);
    auditCreateMock.mockResolvedValue({ id: "audit-1" });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      ticket: { create: ticketCreateMock },
      auditLog: { create: auditCreateMock },
    }));
    queueTicketNotificationMock.mockResolvedValue(undefined);
    queueSmsNotificationMock.mockResolvedValue(undefined);
    isMissingSchemaColumnErrorMock.mockReturnValue(false);
  });

  it("rate limits before parsing or resolving the portal", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
      source: "database",
    });

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.errorCode).toBe("RATE_LIMITED");
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(resolvePublicPortalCompanyMock).not.toHaveBeenCalled();
  });

  it("validates required fields before portal resolution", async () => {
    const response = await POST(request({ reporterEmail: "invalid" }));

    expect(response.status).toBe(400);
    expect(resolvePublicPortalCompanyMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("creates ticket and audit atomically with server-resolved company scope", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(ticketCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        user_id: "owner-1",
        public_reference: "RV-2026-ABC123",
        reporter_email: "anna@example.com",
      }),
    }));
    expect(auditCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        entity_id: "ticket-1",
        metadata: {
          publicReference: "RV-2026-ABC123",
          propertyId: null,
          source: "public_portal",
        },
      }),
    }));
  });

  it("creates tracking token before persistence", async () => {
    createPortalTrackingTokenMock.mockImplementation(() => {
      expect(transactionMock).not.toHaveBeenCalled();
      return "token-before-write";
    });

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.trackingToken).toBe("token-before-write");
  });

  it("retries a unique public reference collision without duplicating audit", async () => {
    const conflict = Object.assign(new Error("duplicate"), {
      code: "P2002",
      meta: { target: ["public_reference"] },
    });
    generatePublicReferenceMock
      .mockReturnValueOnce("RV-COLLISION")
      .mockReturnValueOnce("RV-SAFE");
    transactionMock
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback({
        ticket: { create: ticketCreateMock },
        auditLog: { create: auditCreateMock },
      }));

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(2);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "public ticket reference collision",
      expect.objectContaining({ eventCode: "public_tickets.create.reference_collision" }),
    );
  });

  it("returns 201 when email and SMS fail after the database commit", async () => {
    queueTicketNotificationMock.mockRejectedValue(new Error("mail unavailable"));
    queueSmsNotificationMock.mockRejectedValue(new Error("sms unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe("public-request-1");
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "public ticket created with side-effect failures",
      expect.objectContaining({
        eventCode: "public_tickets.create.partial_failure",
        failedSideEffects: 2,
      }),
    );
  });

  it("requires the selected property to belong to the resolved company", async () => {
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await POST(request({ propertyId: "property-other" }));

    expect(response.status).toBe(400);
    expect(propertyFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "property-other",
        company_id: "company-1",
        status: "active",
        deleted_at: null,
      }),
    }));
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
