import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  requireCompanyUserMock,
  canExportTicketsMock,
  ticketFindManyMock,
  writeAuditLogMock,
  notDeletedFilterMock,
  isMissingSchemaColumnErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  requireCompanyUserMock: vi.fn(),
  canExportTicketsMock: vi.fn(),
  ticketFindManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  notDeletedFilterMock: vi.fn(),
  isMissingSchemaColumnErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: { ticket: { findMany: ticketFindManyMock } },
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  requireCompanyUser: requireCompanyUserMock,
  canExportTickets: canExportTicketsMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/schema-readiness", () => ({
  notDeletedFilter: notDeletedFilterMock,
  isMissingSchemaColumnError: isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessage: vi.fn(() => "Databasen är inte redo"),
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET } from "./route";

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";

const user = {
  id: "user-1",
  company_id: "company-1",
  role: "admin",
  email: "admin@example.com",
  name: "Admin",
};

function request() {
  return new Request("https://revalta.test/api/tickets/export", {
    headers: { "x-request-id": REQUEST_ID },
  });
}

function ticket(overrides: Record<string, unknown> = {}) {
  return {
    public_reference: "REV-1",
    title: "Vattenläcka",
    status: "new",
    priority: "urgent",
    category: "water",
    due_date: new Date("2026-07-28T12:00:00.000Z"),
    created_at: new Date("2026-07-27T12:00:00.000Z"),
    reporter_email: "resident@example.com",
    property: { name: "Fastigheten 1" },
    assigned_to: { name: "Tekniker", email: "tech@example.com" },
    ...overrides,
  };
}

describe("GET /api/tickets/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    getCurrentUserMock.mockResolvedValue(user);
    requireCompanyUserMock.mockReturnValue(user);
    canExportTicketsMock.mockReturnValue(true);
    ticketFindManyMock.mockResolvedValue([ticket()]);
    writeAuditLogMock.mockResolvedValue(undefined);
    notDeletedFilterMock.mockResolvedValue({ deleted_at: null });
    isMissingSchemaColumnErrorMock.mockReturnValue(false);
  });

  it("fails closed before database access without a session", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(ticketFindManyMock).not.toHaveBeenCalled();
  });

  it("blocks roles without export permission", async () => {
    canExportTicketsMock.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(ticketFindManyMock).not.toHaveBeenCalled();
  });

  it("uses explicit company scope and active parent property scope", async () => {
    await GET(request());

    expect(ticketFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          company_id: "company-1",
          deleted_at: null,
          OR: [
            { property_id: null },
            { property: { company_id: "company-1", deleted_at: null } },
          ],
        }),
        take: 50_001,
      }),
    );
  });

  it("neutralizes spreadsheet formulas and returns private correlated CSV", async () => {
    ticketFindManyMock.mockResolvedValue([
      ticket({
        title: "=HYPERLINK(\"https://evil.example\")",
        property: { name: "+SUM(1,1)" },
      }),
    ]);

    const response = await GET(request());
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+SUM(1,1)");
  });

  it("rejects exports larger than the configured resource ceiling", async () => {
    ticketFindManyMock.mockResolvedValue(
      Array.from({ length: 50_001 }, (_, index) => ticket({ public_reference: `REV-${index}` })),
    );

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.errorCode).toBe("VALIDATION_FAILED");
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("keeps a successful export available when audit logging fails", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "ticket export audit failed",
      expect.objectContaining({ eventCode: "tickets.export.audit_failed" }),
    );
  });

  it("returns a safe service-unavailable response for schema mismatch", async () => {
    const error = new Error("missing column");
    ticketFindManyMock.mockRejectedValue(error);
    isMissingSchemaColumnErrorMock.mockReturnValue(true);

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.errorCode).toBe("SERVICE_UNAVAILABLE");
    expect(payload.requestId).toBe(REQUEST_ID);
  });
});