import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  userFindFirstMock,
  propertyFindFirstMock,
  ticketCreateMock,
  ticketFindManyMock,
  ticketCountMock,
  transactionMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  ticketCreateMock: vi.fn(),
  ticketFindManyMock: vi.fn(),
  ticketCountMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/db", () => ({
  default: {
    user: { findFirst: userFindFirstMock },
    property: { findFirst: propertyFindFirstMock },
    ticket: { create: ticketCreateMock, findMany: ticketFindManyMock, count: ticketCountMock },
    $transaction: transactionMock,
  },
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/integrations", () => ({ queueTicketNotification: vi.fn(), recordAiEvent: vi.fn() }));
vi.mock("@/lib/schema-readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema-readiness")>()),
  notDeletedFilter: vi.fn(async () => ({ deleted_at: null })),
  hasTicketAiSourceColumn: vi.fn(async () => true),
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET, POST } from "./route";
import { Prisma } from "@prisma/client";
import { schemaMismatchUserMessage } from "@/lib/schema-readiness";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const TENANT_A = "company-1";
const TENANT_B_PROPERTY = "property-tenant-b";
const TENANT_B_USER = "user-tenant-b";

function request(overrides: Record<string, unknown> = {}) {
  return new Request("https://www.revalta.se/api/tickets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      title: "Läckande kran",
      description: "Det droppar kontinuerligt från kökskranen.",
      category: "vvs",
      priority: "normal",
      ...overrides,
    }),
  });
}

function getRequest(path = "") {
  return new Request(`https://www.revalta.se/api/tickets${path}`, {
    headers: { "x-request-id": requestId },
  });
}

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER_API_KEY", "");
  createLoggerMock.mockReturnValue({
    debug: vi.fn(),
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
  });
});

describe("POST /api/tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(async (callback) => callback({
      ticket: { create: ticketCreateMock },
      auditLog: { create: vi.fn() },
    }));
  });

  it("prevents technicians from assigning a new ticket to another user with a correlated safe error", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await POST(request({ assignedToId: "tech-2" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Du saknar behörighet att tilldela ärenden till andra",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(userFindFirstMock).not.toHaveBeenCalled();
    expect(ticketCreateMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "ticket assignment forbidden",
      expect.objectContaining({
        event: "tickets.create.assignment_forbidden",
        userId: "tech-1",
        companyId: "company-1",
      }),
    );
  });

  it("rejects unsupported category and priority values with stable validation codes", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

    const categoryResponse = await POST(request({ category: "<script>" }));
    const priorityResponse = await POST(request({ priority: "super-urgent" }));

    expect(categoryResponse.status).toBe(400);
    expect(priorityResponse.status).toBe(400);
    expect((await categoryResponse.json()).errorCode).toBe("VALIDATION_FAILED");
    expect((await priorityResponse.json()).errorCode).toBe("VALIDATION_FAILED");
    expect(ticketCreateMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A creates a ticket on Tenant B property_id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: TENANT_A, role: "manager" });
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await POST(request({ propertyId: TENANT_B_PROPERTY }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: "Vald fastighet hittades inte",
      errorCode: "NOT_FOUND",
      requestId,
    });
    expect(propertyFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: TENANT_B_PROPERTY,
        company_id: TENANT_A,
        deleted_at: null,
      }),
    }));
    expect(ticketCreateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A assigns a Tenant B user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: TENANT_A, role: "manager" });
    userFindFirstMock.mockResolvedValue(null);

    const response = await POST(request({ assignedToId: TENANT_B_USER }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: "Vald ansvarig hittades inte",
      errorCode: "NOT_FOUND",
      requestId,
    });
    expect(userFindFirstMock).toHaveBeenCalledWith({
      where: { id: TENANT_B_USER, company_id: TENANT_A },
      select: { id: true },
    });
    expect(ticketCreateMock).not.toHaveBeenCalled();
  });

  it("creates the ticket inside the same transaction as its audit record and correlates success", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      email: "manager@example.se",
      company_id: "company-1",
      role: "manager",
    });
    ticketCreateMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckande kran",
      category: "vvs",
      priority: "normal",
      assigned_to_id: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(ticketCreateMock).toHaveBeenCalledTimes(1);
    expect(ticketCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ai_summary: expect.any(String),
        ai_recommended_action: expect.any(String),
        ai_confidence: expect.any(Number),
        ai_processed_at: expect.any(Date),
        ai_source: "fallback",
      }),
    }));
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "ticket create completed",
      expect.objectContaining({
        event: "tickets.create.completed",
        userId: "manager-1",
        companyId: "company-1",
        ticketId: "ticket-1",
      }),
    );
  });

  it("returns a safe correlated 500 when ticket creation fails", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      email: "manager@example.se",
      company_id: "company-1",
      role: "manager",
    });
    transactionMock.mockRejectedValue(new Error("postgres://user:super-secret@db.internal/revalta"));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "ticket create failed",
      expect.any(Error),
      expect.objectContaining({ event: "tickets.create.failed" }),
    );
  });

  it("maps a missing Ticket table on create to 503 SERVICE_UNAVAILABLE", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      email: "manager@example.se",
      company_id: "company-1",
      role: "manager",
    });
    transactionMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "The table `public.Ticket` does not exist in the current database.",
        {
          code: "P2021",
          clientVersion: "test",
          meta: { table: "public.Ticket" },
        },
      ),
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: schemaMismatchUserMessage(),
      errorCode: "SERVICE_UNAVAILABLE",
      requestId,
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "ticket create schema unavailable",
      expect.any(Error),
      expect.objectContaining({ event: "tickets.create.schema_unavailable" }),
    );
  });

  it("keeps missing title as field validation", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      email: "manager@example.se",
      company_id: "company-1",
      role: "manager",
    });

    const response = await POST(request({ title: "  " }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Titel och beskrivning krävs");
    expect(body.errorCode).toBe("VALIDATION_FAILED");
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/tickets pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    ticketFindManyMock.mockResolvedValue([]);
    ticketCountMock.mockResolvedValue(245);
  });

  it("bounds page size and returns tenant-scoped correlated pagination metadata", async () => {
    const response = await GET(getRequest("?page=3&pageSize=1000"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(ticketFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ skip: 200, take: 100 }));
    expect(ticketCountMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.any(Object) }));
    expect(body.pagination).toEqual({ page: 3, pageSize: 100, total: 245, totalPages: 3 });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "ticket list completed",
      expect.objectContaining({
        event: "tickets.list.completed",
        userId: "manager-1",
        companyId: "company-1",
        returned: 0,
        total: 245,
        page: 3,
        pageSize: 100,
      }),
    );
  });

  it("normalizes leftover assigned rows to received and expands received filters", async () => {
    ticketFindManyMock.mockResolvedValue([{
      id: "ticket-1",
      title: "Läckande kran",
      status: "assigned",
      priority: "normal",
    }]);
    ticketCountMock.mockResolvedValue(1);

    const response = await GET(getRequest("?status=received"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(ticketFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ["received", "assigned", "planned"] },
      }),
    }));
    expect(body.tickets[0].status).toBe("received");
  });

  it("returns a safe correlated 401 without touching ticket data", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: "Obehörig",
      errorCode: "UNAUTHORIZED",
      requestId,
    });
    expect(ticketFindManyMock).not.toHaveBeenCalled();
    expect(ticketCountMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "ticket list rejected",
      expect.objectContaining({ event: "tickets.list.unauthorized" }),
    );
  });

  it("keeps Tenant B propertyId inside Tenant A company_id so the list cannot leak", async () => {
    const response = await GET(getRequest(`?propertyId=${TENANT_B_PROPERTY}`));

    expect(response.status).toBe(200);
    expect(ticketFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: TENANT_A,
        property_id: TENANT_B_PROPERTY,
      }),
    }));
    expect(ticketCountMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: TENANT_A,
        property_id: TENANT_B_PROPERTY,
      }),
    }));
  });
});

// Test the route itself; proxy/navigation restrictions are not authorization.
describe("organisation scope is mandatory", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["owner", "admin", "manager", "technician", "viewer"])("rejects detached %s before any data access or write", async (role) => {
    getCurrentUserMock.mockResolvedValue({ id: "former-owner", company_id: null, role });
    const read = await GET(getRequest());
    const write = await POST(request());
    expect(read.status).toBe(403);
    expect(write.status).toBe(403);
    expect(ticketFindManyMock).not.toHaveBeenCalled();
    expect(ticketCountMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });
  it.each(["resident", "unknown"])("rejects %s directly even with a company", async (role) => {
    getCurrentUserMock.mockResolvedValue({ id: "user", company_id: "company-1", role });
    expect((await GET(getRequest())).status).toBe(403);
    expect((await POST(request())).status).toBe(403);
    expect(ticketFindManyMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
