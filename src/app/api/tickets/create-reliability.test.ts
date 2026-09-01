import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketCreateMock,
  transactionMock,
  writeAuditLogMock,
  queueTicketNotificationMock,
  recordAiEventMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketCreateMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  queueTicketNotificationMock: vi.fn(),
  recordAiEventMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageTickets: () => true,
  canAssignWorkOrders: () => true,
  canExportTickets: () => true,
  shouldScopeToAssignedWork: () => false,
  tenantWhere: () => ({ company_id: "company-1" }),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: queueTicketNotificationMock,
  recordAiEvent: recordAiEventMock,
}));
vi.mock("@/lib/schema-readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema-readiness")>()),
  notDeletedFilter: vi.fn(async () => ({ deleted_at: null })),
}));
vi.mock("@/lib/structured-logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
  }),
}));
vi.mock("@/lib/db", () => ({
  default: {
    user: { findFirst: vi.fn() },
    property: { findFirst: vi.fn() },
    ticket: { findMany: vi.fn(), count: vi.fn() },
    $transaction: transactionMock,
  },
}));

import { POST } from "./route";

function request() {
  return new Request("https://www.revalta.se/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Läckande kran",
      description: "Det droppar kontinuerligt från kökskranen.",
      category: "vvs",
      priority: "normal",
    }),
  });
}

const ticket = {
  id: "ticket-1",
  title: "Läckande kran",
  description: "Det droppar kontinuerligt från kökskranen.",
  status: "new",
  category: "vvs",
  priority: "normal",
  property_id: null,
  assigned_to_id: null,
  created_at: new Date("2026-09-02T00:00:00Z"),
  updated_at: new Date("2026-09-02T00:00:00Z"),
  due_date: new Date("2026-09-05T00:00:00Z"),
  property: null,
  assigned_to: null,
  _count: { comments: 0 },
};

describe("ticket creation reliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      email: "manager@example.se",
      company_id: "company-1",
      role: "manager",
    });
    ticketCreateMock.mockResolvedValue(ticket);
    writeAuditLogMock.mockResolvedValue(undefined);
    queueTicketNotificationMock.mockResolvedValue(undefined);
    recordAiEventMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      ticket: { create: ticketCreateMock },
    }));
  });

  it("returns 201 after commit even if both notification and AI telemetry fail", async () => {
    queueTicketNotificationMock.mockRejectedValue(new Error("mail unavailable"));
    recordAiEventMock.mockRejectedValue(new Error("telemetry unavailable"));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ success: true, ticket: { id: "ticket-1" } });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "manager-1" }),
      expect.objectContaining({ action: "ticket.created", entityId: "ticket-1" }),
      expect.objectContaining({ ticket: { create: ticketCreateMock } }),
    );
    expect(queueTicketNotificationMock).toHaveBeenCalledTimes(1);
    expect(recordAiEventMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "ticket create notification failed",
      expect.objectContaining({ event: "tickets.create.notification_failed", ticketId: "ticket-1" }),
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "ticket create ai telemetry failed",
      expect.objectContaining({ event: "tickets.create.ai_telemetry_failed", ticketId: "ticket-1" }),
    );
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it("still returns 500 when the atomic ticket and audit transaction itself fails", async () => {
    transactionMock.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(queueTicketNotificationMock).not.toHaveBeenCalled();
    expect(recordAiEventMock).not.toHaveBeenCalled();
  });
});
