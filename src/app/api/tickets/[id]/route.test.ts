import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketFindFirstMock,
  ticketUpdateManyMock,
  userFindFirstMock,
  writeAuditLogMock,
  queueTicketNotificationMock,
  notifyTicketReporterMock,
  transactionMock,
  auditLogCreateMock,
  auditLogFindFirstMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  ticketUpdateManyMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  queueTicketNotificationMock: vi.fn(),
  notifyTicketReporterMock: vi.fn(),
  transactionMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
  auditLogFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: queueTicketNotificationMock,
}));
vi.mock("@/lib/ticket-reporter-notify", () => ({
  notifyTicketReporter: notifyTicketReporterMock,
}));
vi.mock("@/lib/schema-readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema-readiness")>()),
  hasTicketAiSourceColumn: vi.fn(async () => true),
}));

vi.mock("@/lib/db", () => {
  const dbMock = {
    ticket: {
      findFirst: ticketFindFirstMock,
      updateMany: ticketUpdateManyMock,
    },
    user: {
      findFirst: userFindFirstMock,
    },
    auditLog: {
      create: auditLogCreateMock,
      findFirst: auditLogFindFirstMock,
    },
    $transaction: transactionMock,
  };
  transactionMock.mockImplementation((callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return { default: dbMock };
});

import { DELETE, GET, PATCH } from "./route";
import { Prisma } from "@prisma/client";
import { schemaMismatchUserMessage } from "@/lib/schema-readiness";

const params = Promise.resolve({ id: "ticket-1" });

const baseTicketRow = {
  id: "ticket-1",
  title: "Läckande kran",
  description: "Det droppar",
  status: "new",
  category: "vvs",
  priority: "normal",
  public_reference: "REF-1",
  source: "portal",
  reporter_name: "Anna Andersson",
  reporter_email: "anna@example.se",
  reporter_phone: "0701234567",
  reporter_unit: "1201",
  property_id: "property-1",
  assigned_to_id: null,
  created_at: new Date("2026-08-01T10:00:00Z"),
  updated_at: new Date("2026-08-01T10:00:00Z"),
  due_date: new Date("2026-08-05T10:00:00Z"),
  ai_summary: null,
  ai_recommended_action: null,
  ai_confidence: null,
  ai_processed_at: null,
  ai_source: null,
  property: { id: "property-1", name: "Storgatan 1", address: "Storgatan 1", city: "Stockholm" },
  assigned_to: null,
  comments: [],
  attachments: [
    {
      id: "attachment-1",
      file_name: "bild.jpg",
      content_type: "image/jpeg",
      size_bytes: 1234,
      data_url: "data:image/jpeg;base64,xxxx",
      created_at: new Date("2026-08-01T10:00:00Z"),
    },
  ],
};

function makeRequest(method: string, body?: unknown) {
  return new Request("http://localhost/api/tickets/ticket-1", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function mockAssignedTicketPatch(fromStatus: string, toStatus: string) {
  getCurrentUserMock.mockResolvedValue({
    id: "user-1",
    company_id: "company-1",
    email: "user@example.se",
    role: "owner",
  });
  ticketFindFirstMock.mockResolvedValue({
    id: "ticket-1",
    title: "Läckande kran",
    status: fromStatus,
    priority: "normal",
    assigned_to_id: "tech-1",
    due_date: null,
    public_reference: "RV-12",
    reporter_email: "anna@example.se",
    reporter_phone: "0701234567",
  });
  transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => {
    const tx = {
      ticket: {
        updateMany: ticketUpdateManyMock,
        findFirst: vi.fn().mockResolvedValue({
          id: "ticket-1",
          title: "Läckande kran",
          status: toStatus,
          priority: "normal",
          due_date: null,
          closed_at: null,
          assigned_to: { id: "tech-1", name: "Tekniker", email: "tech@example.se" },
        }),
      },
      auditLog: { create: auditLogCreateMock },
    };
    return callback(tx);
  });
}

describe("tickets/[id] GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditLogFindFirstMock.mockResolvedValue(null);
  });

  it("returns 401 when there is no current user", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await GET(makeRequest("GET"), { params });

    expect(response.status).toBe(401);
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is a resident (not a company staff user)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "resident" });

    const response = await GET(makeRequest("GET"), { params });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("scopes the lookup by the current user's company_id (tenant isolation)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({ ...baseTicketRow });

    await GET(makeRequest("GET"), { params });

    expect(ticketFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "ticket-1",
          deleted_at: null,
          company_id: "company-1",
        }),
      }),
    );
  });

  it("returns 404 when the ticket does not exist or belongs to another company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue(null);

    const response = await GET(makeRequest("GET"), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Ärendet hittades inte");
  });

  it("returns 404 for a technician when the ticket is not assigned to them", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    ticketFindFirstMock.mockResolvedValue({ ...baseTicketRow, assigned_to_id: "tech-2" });

    const response = await GET(makeRequest("GET"), { params });

    expect(response.status).toBe(404);
  });

  it("returns 200 with the ticket for a technician when it is assigned to them", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    ticketFindFirstMock.mockResolvedValue({ ...baseTicketRow, assigned_to_id: "tech-1" });

    const response = await GET(makeRequest("GET"), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ticket.id).toBe("ticket-1");
  });

  it("returns the ticket, permissions and rewritten attachment URLs on the happy path", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({ ...baseTicketRow });

    const response = await GET(makeRequest("GET"), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ticket.id).toBe("ticket-1");
    expect(body.ticket.reporter_email).toBe("anna@example.se");
    expect(body.ticket.residentFeedback).toBeNull();
    expect(body.ticket.attachments[0].data_url).toBe("/api/attachments/attachment-1");
    expect(body.ticket.allowedTransitions).toEqual(["received", "in_progress", "closed"]);
    expect(body.permissions).toEqual({ canManage: true, canAssign: true });
  });

  it("keeps stored received status instead of coercing it to new", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({ ...baseTicketRow, status: "received" });

    const response = await GET(makeRequest("GET"), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ticket.status).toBe("received");
    expect(body.ticket.allowedTransitions).toEqual(["in_progress", "waiting", "completed", "closed"]);
  });

  it("normalizes leftover assigned status to received", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({ ...baseTicketRow, status: "assigned" });

    const response = await GET(makeRequest("GET"), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ticket.status).toBe("received");
    expect(body.ticket.allowedTransitions).toEqual(["in_progress", "waiting", "completed", "closed"]);
  });

  it("redacts reporter PII for roles without leasing data access", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    ticketFindFirstMock.mockResolvedValue({ ...baseTicketRow, assigned_to_id: "tech-1" });

    const response = await GET(makeRequest("GET"), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ticket.reporter_name).toBeNull();
    expect(body.ticket.reporter_email).toBeNull();
    expect(body.ticket.reporter_phone).toBeNull();
    expect(body.ticket.reporter_unit).toBeNull();
  });

  it("returns 500 when the database throws", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockRejectedValue(new Error("db down"));

    const response = await GET(makeRequest("GET"), { params });

    expect(response.status).toBe(500);
  });

  it("maps a missing Ticket table on GET to 503 SERVICE_UNAVAILABLE", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "The table `public.Ticket` does not exist in the current database.",
        {
          code: "P2021",
          clientVersion: "test",
          meta: { table: "public.Ticket" },
        },
      ),
    );

    const response = await GET(makeRequest("GET"), { params });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe(schemaMismatchUserMessage());
    expect(body.errorCode).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("tickets/[id] PATCH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    notifyTicketReporterMock.mockResolvedValue({ emailed: true, sms: true });
    auditLogCreateMock.mockResolvedValue(undefined);
    ticketUpdateManyMock.mockResolvedValue({ count: 1 });
  });

  it("returns 401 when there is no current user", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await PATCH(makeRequest("PATCH", { status: "planned" }), { params });

    expect(response.status).toBe(401);
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the role cannot manage tickets", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "viewer" });

    const response = await PATCH(makeRequest("PATCH", { status: "planned" }), { params });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att uppdatera ärenden");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("rejects residents before looking up a ticket", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await PATCH(makeRequest("PATCH", { status: "planned" }), { params });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is not valid JSON", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    const request = new Request("http://localhost/api/tickets/ticket-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });

    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("scopes the existing-ticket lookup by the current user's company_id (tenant isolation)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue(null);

    await PATCH(makeRequest("PATCH", { priority: "high" }), { params });

    expect(ticketFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "ticket-1",
          deleted_at: null,
          company_id: "company-1",
        }),
      }),
    );
  });

  it("returns 404 when the ticket does not exist or belongs to another company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue(null);

    const response = await PATCH(makeRequest("PATCH", { priority: "high" }), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Ärendet hittades inte");
    expect(ticketUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a technician when the ticket is not assigned to them", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckande kran",
      status: "new",
      priority: "normal",
      assigned_to_id: "tech-2",
      due_date: null,
    });

    const response = await PATCH(makeRequest("PATCH", { priority: "high" }), { params });

    expect(response.status).toBe(404);
    expect(ticketUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 403 when a technician attempts to reassign the ticket", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckande kran",
      status: "new",
      priority: "normal",
      assigned_to_id: "tech-1",
      due_date: null,
    });

    const response = await PATCH(makeRequest("PATCH", { assignedToId: "tech-1" }), { params });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Du saknar behörighet att ändra ansvarig");
    expect(ticketUpdateManyMock).not.toHaveBeenCalled();
  });

  it("scopes the assignee lookup by the current user's company_id (tenant isolation)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckande kran",
      status: "new",
      priority: "normal",
      assigned_to_id: null,
      due_date: null,
    });
    userFindFirstMock.mockResolvedValue(null);

    const response = await PATCH(makeRequest("PATCH", { assignedToId: "tech-in-other-company" }), { params });
    const body = await response.json();

    expect(userFindFirstMock).toHaveBeenCalledWith({
      where: { id: "tech-in-other-company", company_id: "company-1" },
      select: { id: true },
    });
    expect(response.status).toBe(404);
    expect(body.error).toBe("Vald ansvarig hittades inte");
    expect(ticketUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown status value", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckande kran",
      status: "new",
      priority: "normal",
      assigned_to_id: null,
      due_date: null,
    });

    const response = await PATCH(makeRequest("PATCH", { status: "not-a-real-status" }), { params });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Ogiltig ärendestatus");
    expect(ticketUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown priority value", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckande kran",
      status: "new",
      priority: "normal",
      assigned_to_id: null,
      due_date: null,
    });

    const response = await PATCH(makeRequest("PATCH", { priority: "super-urgent" }), { params });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Ogiltig prioritet");
    expect(ticketUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the requested status transition is not allowed", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckande kran",
      status: "closed",
      priority: "normal",
      assigned_to_id: null,
      due_date: null,
    });

    const response = await PATCH(makeRequest("PATCH", { status: "new" }), { params });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("Statusövergången är inte tillåten");
    expect(body.currentStatus).toBe("closed");
    expect(ticketUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 when moving to an assignable status without an assignee", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckande kran",
      status: "new",
      priority: "normal",
      assigned_to_id: null,
      due_date: null,
    });

    const response = await PATCH(makeRequest("PATCH", { status: "in_progress" }), { params });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("En ansvarig måste väljas för denna status");
    expect(ticketUpdateManyMock).not.toHaveBeenCalled();
  });

  it("updates the ticket, scopes the write by company_id, and writes audit logs on the happy path", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", email: "user@example.se", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckande kran",
      status: "new",
      priority: "normal",
      assigned_to_id: null,
      due_date: null,
      public_reference: "RV-12",
      reporter_email: "anna@example.se",
      reporter_phone: "0701234567",
    });
    userFindFirstMock.mockResolvedValue({ id: "tech-1" });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const tx = {
        ticket: { updateMany: ticketUpdateManyMock, findFirst: vi.fn().mockResolvedValue({
          id: "ticket-1",
          title: "Läckande kran",
          status: "received",
          priority: "normal",
          due_date: null,
          closed_at: null,
          assigned_to: { id: "tech-1", name: "Tekniker", email: "tech@example.se" },
        }) },
        auditLog: { create: auditLogCreateMock },
      };
      return callback(tx);
    });

    const response = await PATCH(
      makeRequest("PATCH", { assignedToId: "tech-1", transitionReason: "Tilldelad tekniker" }),
      { params },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.ticket.status).toBe("received");
    expect(ticketUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ticket-1", company_id: "company-1", deleted_at: null },
      }),
    );
    expect(auditLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ company_id: "company-1", action: "ticket.status_changed" }),
      }),
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ action: "ticket.lifecycle_processed", entityId: "ticket-1" }),
    );
    expect(notifyTicketReporterMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ id: "ticket-1", reporter_email: "anna@example.se" }),
      "updated",
    );
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({
        recipient: "tech@example.se",
        event: "updated",
        emailContent: expect.objectContaining({
          subject: "Tilldelad: Läckande kran",
        }),
      }),
    );
  });

  it("heals leftover assigned status to received on a later update", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", email: "user@example.se", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckande kran",
      status: "assigned",
      priority: "normal",
      assigned_to_id: "tech-1",
      due_date: null,
      public_reference: "RV-12",
      reporter_email: "anna@example.se",
      reporter_phone: "0701234567",
    });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const tx = {
        ticket: { updateMany: ticketUpdateManyMock, findFirst: vi.fn().mockResolvedValue({
          id: "ticket-1",
          title: "Läckande kran",
          status: "received",
          priority: "high",
          due_date: null,
          closed_at: null,
          assigned_to: { id: "tech-1", name: "Tekniker", email: "tech@example.se" },
        }) },
        auditLog: { create: auditLogCreateMock },
      };
      return callback(tx);
    });

    const response = await PATCH(makeRequest("PATCH", { priority: "high" }), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ticket.status).toBe("received");
    expect(ticketUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "received", priority: "high" }),
      }),
    );
  });

  it("emails the assignee when a ticket is paused", async () => {
    mockAssignedTicketPatch("in_progress", "waiting");

    const response = await PATCH(makeRequest("PATCH", { status: "waiting" }), { params });

    expect(response.status).toBe(200);
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({
        recipient: "tech@example.se",
        emailContent: expect.objectContaining({
          subject: "Pausad: Läckande kran",
          text: expect.stringContaining("Väntar"),
        }),
      }),
    );
    expect(queueTicketNotificationMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        emailContent: expect.objectContaining({ subject: "Tilldelad: Läckande kran" }),
      }),
    );
  });

  it("emails the assignee when a ticket is completed", async () => {
    mockAssignedTicketPatch("in_progress", "completed");

    const response = await PATCH(makeRequest("PATCH", { status: "completed" }), { params });

    expect(response.status).toBe(200);
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({
        recipient: "tech@example.se",
        emailContent: expect.objectContaining({ subject: "Slutförd: Läckande kran" }),
      }),
    );
  });

  it("rejects cancelled because it is not a ticket status", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckande kran",
      status: "in_progress",
      priority: "normal",
      assigned_to_id: "tech-1",
      due_date: null,
    });

    const response = await PATCH(makeRequest("PATCH", { status: "cancelled" }), { params });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Ogiltig ärendestatus");
    expect(ticketUpdateManyMock).not.toHaveBeenCalled();
    expect(queueTicketNotificationMock).not.toHaveBeenCalled();
  });

  it("emails the assignee when a paused ticket is resumed", async () => {
    mockAssignedTicketPatch("waiting", "in_progress");

    const response = await PATCH(makeRequest("PATCH", { status: "in_progress" }), { params });

    expect(response.status).toBe(200);
    expect(queueTicketNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({
        recipient: "tech@example.se",
        emailContent: expect.objectContaining({
          subject: "Återupptagen: Läckande kran",
          text: expect.stringContaining("Pågår"),
        }),
      }),
    );
  });

  it("returns 404 when the transactional update affects no rows (lost the race)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckande kran",
      status: "new",
      priority: "normal",
      assigned_to_id: null,
      due_date: null,
    });
    ticketUpdateManyMock.mockResolvedValue({ count: 0 });

    const response = await PATCH(makeRequest("PATCH", { priority: "high" }), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Ärende hittades inte");
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockRejectedValue(new Error("db down"));

    const response = await PATCH(makeRequest("PATCH", { priority: "high" }), { params });

    expect(response.status).toBe(500);
  });
});

describe("tickets/[id] DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    ticketUpdateManyMock.mockResolvedValue({ count: 1 });
  });

  it("returns 401 when there is no current user", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await DELETE(makeRequest("DELETE"), { params });

    expect(response.status).toBe(401);
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the role cannot manage tickets", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "viewer" });

    const response = await DELETE(makeRequest("DELETE"), { params });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att ta bort ärenden");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("rejects residents before looking up a ticket", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await DELETE(makeRequest("DELETE"), { params });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("rejects missing company with the staff copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null, role: "owner" });

    const response = await DELETE(makeRequest("DELETE"), { params });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("scopes the lookup and the soft-delete by the current user's company_id (tenant isolation)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({ id: "ticket-1", title: "Läckande kran", status: "new", assigned_to_id: null });

    await DELETE(makeRequest("DELETE"), { params });

    expect(ticketFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "ticket-1", company_id: "company-1", deleted_at: null }),
      }),
    );
    expect(ticketUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "ticket-1", company_id: "company-1", deleted_at: null },
      data: { deleted_at: expect.any(Date) },
    });
  });

  it("returns 404 when the ticket does not exist or belongs to another company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue(null);

    const response = await DELETE(makeRequest("DELETE"), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Ärendet hittades inte");
    expect(ticketUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a technician when the ticket is not assigned to them", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    ticketFindFirstMock.mockResolvedValue({ id: "ticket-1", title: "Läckande kran", status: "new", assigned_to_id: "tech-2" });

    const response = await DELETE(makeRequest("DELETE"), { params });

    expect(response.status).toBe(404);
    expect(ticketUpdateManyMock).not.toHaveBeenCalled();
  });

  it("soft-deletes the ticket and writes an audit log on the happy path", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({ id: "ticket-1", title: "Läckande kran", status: "new", assigned_to_id: null });

    const response = await DELETE(makeRequest("DELETE"), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ action: "ticket.deleted", entityId: "ticket-1" }),
    );
  });

  it("returns 404 when the soft-delete affects no rows (lost the race)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({ id: "ticket-1", title: "Läckande kran", status: "new", assigned_to_id: null });
    ticketUpdateManyMock.mockResolvedValue({ count: 0 });

    const response = await DELETE(makeRequest("DELETE"), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Ärendet hittades inte");
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockRejectedValue(new Error("db down"));

    const response = await DELETE(makeRequest("DELETE"), { params });

    expect(response.status).toBe(500);
  });
});
