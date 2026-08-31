import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, ticketFindFirstMock, ticketUpdateManyMock, writeAuditLogMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  ticketUpdateManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/integrations", () => ({ queueTicketNotification: vi.fn() }));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock, updateMany: ticketUpdateManyMock },
    user: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { DELETE } from "./route";

const params = Promise.resolve({ id: "ticket-1" });

describe("DELETE /api/tickets/[id] authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ticketUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("denies an assigned technician after scoped lookup but before deletion", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician", email: "tech@example.se" });
    ticketFindFirstMock.mockResolvedValue({ id: "ticket-1", title: "Läckande kran", status: "planned", assigned_to_id: "tech-1" });

    const response = await DELETE(new Request("http://localhost/api/tickets/ticket-1", { method: "DELETE" }), { params });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/ta bort ärenden/i);
    expect(ticketFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: "ticket-1",
        company_id: "company-1",
        deleted_at: null,
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
      select: { id: true, title: true, status: true, assigned_to_id: true },
    });
    expect(ticketUpdateManyMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("conceals an unassigned ticket from a technician", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician", email: "tech@example.se" });
    ticketFindFirstMock.mockResolvedValue({ id: "ticket-1", title: "Läckande kran", status: "planned", assigned_to_id: "tech-2" });

    const response = await DELETE(new Request("http://localhost/api/tickets/ticket-1", { method: "DELETE" }), { params });

    expect(response.status).toBe(404);
    expect(ticketUpdateManyMock).not.toHaveBeenCalled();
  });

  it("allows a manager to soft-delete a company-scoped ticket", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager", email: "manager@example.se" });
    ticketFindFirstMock.mockResolvedValue({ id: "ticket-1", title: "Läckande kran", status: "planned", assigned_to_id: "tech-1" });

    const response = await DELETE(new Request("http://localhost/api/tickets/ticket-1", { method: "DELETE" }), { params });

    expect(response.status).toBe(200);
    expect(ticketUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "ticket-1", company_id: "company-1", deleted_at: null },
      data: { deleted_at: expect.any(Date) },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entityType: "ticket",
      entityId: "ticket-1",
      action: "ticket.deleted",
    }));
  });
});
