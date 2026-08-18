import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  leaseFindManyMock,
  leaseFindFirstMock,
  ticketFindManyMock,
  ticketCreateMock,
  managedDocumentFindManyMock,
  auditLogFindManyMock,
  auditLogCreateMock,
  writeAuditLogMock,
  transactionMock,
  getDocumentLifecycleMapMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  leaseFindManyMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  ticketFindManyMock: vi.fn(),
  ticketCreateMock: vi.fn(),
  managedDocumentFindManyMock: vi.fn(),
  auditLogFindManyMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  transactionMock: vi.fn(),
  getDocumentLifecycleMapMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/document-lifecycle", () => ({
  getDocumentLifecycleMap: getDocumentLifecycleMapMock,
}));

vi.mock("@/lib/public-portal", () => ({
  generatePublicReference: () => "RV-TEST-1",
}));

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

vi.mock("@/lib/db", () => ({
  default: {
    lease: {
      findMany: leaseFindManyMock,
      findFirst: leaseFindFirstMock,
    },
    ticket: {
      findMany: ticketFindManyMock,
      create: ticketCreateMock,
    },
    managedDocument: {
      findMany: managedDocumentFindManyMock,
    },
    auditLog: {
      findMany: auditLogFindManyMock,
      create: auditLogCreateMock,
    },
    $transaction: transactionMock,
  },
}));

import { GET, POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function getRequest() {
  return new Request("https://www.revalta.se/api/resident-portal", {
    headers: { "x-request-id": requestId },
  });
}

function postRequest(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/resident-portal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify(body),
  });
}

describe("resident-portal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    getDocumentLifecycleMapMock.mockResolvedValue(new Map());
    writeAuditLogMock.mockResolvedValue(undefined);
    leaseFindManyMock.mockResolvedValue([]);
    ticketFindManyMock.mockResolvedValue([]);
    managedDocumentFindManyMock.mockResolvedValue([]);
    auditLogFindManyMock.mockResolvedValue([]);
  });

  it("scopes resident GET to matching lease holder email and correlates private success", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(leaseFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-1",
        lease_holder: {
          deleted_at: null,
          email: { equals: "boende@exempel.se", mode: "insensitive" },
        },
      }),
    }));
    expect(ticketFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        reporter_email: { equals: "boende@exempel.se", mode: "insensitive" },
      }),
    }));
    expect(body.isResident).toBe(true);
    expect(body.canCreate).toBe(true);
    expect(body.canManage).toBe(false);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "resident portal workspace completed",
      expect.objectContaining({
        event: "resident_portal.workspace.completed",
        userId: "user-1",
        companyId: "company-1",
        residentView: true,
        leaseCount: 0,
        ticketCount: 0,
        documentCount: 0,
      }),
    );
    expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("boende@exempel.se");
  });

  it("keeps company-wide leases for staff GET", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "manager",
      email: "forvaltare@exempel.se",
    });

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(leaseFindManyMock.mock.calls[0][0].where.lease_holder).toBeUndefined();
    expect(body.isResident).toBe(false);
    expect(body.canManage).toBe(true);
  });

  it("denies technicians from reading company-wide resident portal leases with a stable correlated 403", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      company_id: "company-1",
      role: "technician",
      email: "tekniker@exempel.se",
    });

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "Du saknar behörighet till boendeportalen",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(leaseFindManyMock).not.toHaveBeenCalled();
  });

  it("returns a stable correlated 401 before resident data is queried", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(leaseFindManyMock).not.toHaveBeenCalled();
    expect(ticketFindManyMock).not.toHaveBeenCalled();
    expect(managedDocumentFindManyMock).not.toHaveBeenCalled();
  });

  it("lets a resident create a ticket only for a matched lease with correlated success", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });
    leaseFindFirstMock.mockResolvedValue({
      id: "lease-1",
      lease_number: "AVT-1",
      property_id: "property-1",
      unit: { designation: "1101" },
      lease_holder: {
        id: "holder-1",
        name: "Ada Boende",
        contact_name: null,
        email: "boende@exempel.se",
        phone: null,
      },
    });
    transactionMock.mockImplementation(async (callback: (tx: {
      ticket: { create: typeof ticketCreateMock };
      auditLog: { create: typeof auditLogCreateMock };
    }) => Promise<unknown>) => callback({
      ticket: { create: ticketCreateMock },
      auditLog: { create: auditLogCreateMock },
    }));
    ticketCreateMock.mockResolvedValue({ id: "ticket-1", public_reference: "RV-TEST-1" });

    const response = await POST(postRequest({
      leaseId: "lease-1",
      subject: "Läckage",
      message: "Det droppar under diskbänken sedan igår.",
      category: "plumbing",
      priority: "high",
    }));

    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        lease_holder: {
          deleted_at: null,
          email: { equals: "boende@exempel.se", mode: "insensitive" },
        },
      }),
    }));
    expect(ticketCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        reporter_email: "boende@exempel.se",
        source: "resident_portal",
      }),
    }));
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "resident portal ticket created",
      expect.objectContaining({
        event: "resident_portal.ticket.created",
        userId: "user-1",
        companyId: "company-1",
        ticketId: "ticket-1",
        residentView: true,
      }),
    );
    expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("Läckage");
    expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("diskbänken");
  });

  it("returns correlated 404 when resident tries another lease without logging the submitted lease id", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });
    leaseFindFirstMock.mockResolvedValue(null);

    const response = await POST(postRequest({
      leaseId: "external-secret-lease",
      subject: "Läckage",
      message: "Det droppar under diskbänken sedan igår.",
      category: "plumbing",
      priority: "high",
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: "Det aktiva hyresavtalet hittades inte",
      errorCode: "NOT_FOUND",
      requestId,
    });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-secret-lease");
  });

  it("blocks viewer from creating tickets with a stable correlated 403", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "viewer",
      email: "lasare@exempel.se",
    });

    const response = await POST(postRequest({
      leaseId: "lease-1",
      subject: "Läckage",
      message: "Det droppar under diskbänken sedan igår.",
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Du saknar behörighet", errorCode: "FORBIDDEN", requestId });
  });

  it("returns a safe correlated 500 without leaking dependency details", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("postgres://user:secret@db.internal/revalta"));

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "resident portal workspace failed",
      expect.any(Error),
      expect.objectContaining({ event: "resident_portal.workspace.failed" }),
    );
  });
});
