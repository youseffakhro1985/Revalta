import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  requireCompanyMemberMock,
  requireCompanyUserMock,
  canManageTicketsMock,
  canExportTicketsMock,
  shouldScopeToAssignedWorkMock,
  ticketFindManyMock,
  ticketCreateMock,
  propertyFindFirstMock,
  userFindFirstMock,
  writeAuditLogMock,
  queueTicketNotificationMock,
  recordAiEventMock,
  calculateDueDateMock,
  notDeletedFilterMock,
  isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessageMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  requireCompanyMemberMock: vi.fn(),
  requireCompanyUserMock: vi.fn(),
  canManageTicketsMock: vi.fn(),
  canExportTicketsMock: vi.fn(),
  shouldScopeToAssignedWorkMock: vi.fn(),
  ticketFindManyMock: vi.fn(),
  ticketCreateMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  queueTicketNotificationMock: vi.fn(),
  recordAiEventMock: vi.fn(),
  calculateDueDateMock: vi.fn(),
  notDeletedFilterMock: vi.fn(),
  isMissingSchemaColumnErrorMock: vi.fn(),
  schemaMismatchUserMessageMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findMany: ticketFindManyMock, create: ticketCreateMock },
    property: { findFirst: propertyFindFirstMock },
    user: { findFirst: userFindFirstMock },
  },
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  requireCompanyMember: requireCompanyMemberMock,
  requireCompanyUser: requireCompanyUserMock,
  canManageTickets: canManageTicketsMock,
  canExportTickets: canExportTicketsMock,
  shouldScopeToAssignedWork: shouldScopeToAssignedWorkMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: queueTicketNotificationMock,
  recordAiEvent: recordAiEventMock,
}));
vi.mock("@/lib/sla", () => ({ calculateDueDate: calculateDueDateMock }));
vi.mock("@/lib/schema-readiness", () => ({
  notDeletedFilter: notDeletedFilterMock,
  isMissingSchemaColumnError: isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessage: schemaMismatchUserMessageMock,
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET, POST } from "./route";

const requestId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const member = {
  id: "user-1",
  email: "staff@example.se",
  role: "manager",
  company_id: "company-1",
};

const ticket = {
  id: "ticket-1",
  title: "Vattenläcka",
  description: "Läckage i köket",
  status: "new",
  category: "water",
  priority: "high",
  property_id: "property-1",
  assigned_to_id: "user-2",
  created_at: new Date("2026-07-27T10:00:00Z"),
  updated_at: new Date("2026-07-27T10:00:00Z"),
  due_date: new Date("2026-07-28T10:00:00Z"),
  property: null,
  assigned_to: null,
  _count: { comments: 0 },
};

function getRequest(query = "") {
  return new Request(`https://www.revalta.se/api/tickets${query}`, {
    headers: { "x-request-id": requestId },
  });
}

function postRequest(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/tickets", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

describe("ticket route tenant safety and observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(member);
    requireCompanyMemberMock.mockReturnValue(member);
    requireCompanyUserMock.mockReturnValue(member);
    canManageTicketsMock.mockReturnValue(true);
    canExportTicketsMock.mockReturnValue(true);
    shouldScopeToAssignedWorkMock.mockReturnValue(false);
    notDeletedFilterMock.mockResolvedValue({ deleted_at: null });
    isMissingSchemaColumnErrorMock.mockReturnValue(false);
    schemaMismatchUserMessageMock.mockReturnValue("Databasen behöver uppdateras");
    ticketFindManyMock.mockResolvedValue([ticket]);
    ticketCreateMock.mockResolvedValue(ticket);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
    userFindFirstMock.mockResolvedValue({ id: "user-2" });
    writeAuditLogMock.mockResolvedValue(undefined);
    queueTicketNotificationMock.mockResolvedValue(undefined);
    recordAiEventMock.mockResolvedValue(undefined);
    calculateDueDateMock.mockReturnValue(ticket.due_date);
    createLoggerMock.mockReturnValue({
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
  });

  it("fails closed before database access without a company member", async () => {
    requireCompanyMemberMock.mockReturnValue(null);

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.errorCode).toBe("UNAUTHORIZED");
    expect(ticketFindManyMock).not.toHaveBeenCalled();
  });

  it("always scopes ticket listing and property relation to company_id", async () => {
    const response = await GET(getRequest("?propertyId=property-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requestId).toBe(requestId);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(ticketFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-1",
        property_id: "property-1",
        AND: expect.arrayContaining([
          { OR: [{ property_id: null }, { property: { company_id: "company-1", deleted_at: null } }] },
        ]),
      }),
    }));
  });

  it("validates property and assignee within the same company", async () => {
    const response = await POST(postRequest({
      title: " Vattenläcka ",
      description: " Läckage i köket ",
      propertyId: "property-1",
      assignedToId: "user-2",
      priority: "high",
      category: "water",
    }));

    expect(response.status).toBe(201);
    expect(propertyFindFirstMock).toHaveBeenCalledWith({
      where: { id: "property-1", company_id: "company-1", deleted_at: null },
      select: { id: true },
    });
    expect(userFindFirstMock).toHaveBeenCalledWith({
      where: { id: "user-2", company_id: "company-1", status: "active" },
      select: { id: true },
    });
    expect(ticketCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        title: "Vattenläcka",
        description: "Läckage i köket",
        company_id: "company-1",
        user_id: "user-1",
      }),
    }));
  });

  it("returns validation error when assignee is outside the company", async () => {
    userFindFirstMock.mockResolvedValue(null);

    const response = await POST(postRequest({
      title: "Ärende",
      description: "Beskrivning",
      assignedToId: "foreign-user",
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("VALIDATION_FAILED");
    expect(ticketCreateMock).not.toHaveBeenCalled();
  });

  it("does not return 500 after persistence when a side effect fails", async () => {
    queueTicketNotificationMock.mockRejectedValue(new Error("provider unavailable"));

    const response = await POST(postRequest({
      title: "Vattenläcka",
      description: "Läckage i köket",
      priority: "high",
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.ticket.id).toBe("ticket-1");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "ticket created with partial side-effect failure",
      expect.objectContaining({
        eventCode: "tickets.create.partial_failure",
        failedSideEffects: 1,
        ticketId: "ticket-1",
      }),
    );
  });

  it("returns a correlated service unavailable response for schema drift", async () => {
    ticketFindManyMock.mockRejectedValue(new Error("missing column"));
    isMissingSchemaColumnErrorMock.mockReturnValue(true);

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.errorCode).toBe("SERVICE_UNAVAILABLE");
    expect(body.requestId).toBe(requestId);
  });

  it("does not expose internal database errors", async () => {
    ticketCreateMock.mockRejectedValue(new Error("postgres secret detail"));

    const response = await POST(postRequest({ title: "Ärende", description: "Beskrivning" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("postgres secret detail");
  });
});
