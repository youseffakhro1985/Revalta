import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketFindFirstMock,
  ticketUpdateManyMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  ticketUpdateManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: {
      findFirst: ticketFindFirstMock,
      updateMany: ticketUpdateManyMock,
    },
  },
}));

import { POST } from "./route";

const params = Promise.resolve({ id: "ticket-1" });

describe("tickets/[id]/restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    ticketUpdateManyMock.mockResolvedValue({ count: 1 });
  });

  it("restores a soft-deleted ticket and writes audit", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckage",
      status: "open",
      property_id: "property-1",
      property: { deleted_at: null },
    });

    const response = await POST(new Request("http://localhost/api/tickets/ticket-1/restore", { method: "POST" }), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(ticketUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "ticket-1", company_id: "company-1", deleted_at: { not: null } },
      data: { deleted_at: null },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ action: "ticket.restored", entityId: "ticket-1" }),
    );
  });

  it("returns 409 when linked property is soft-deleted", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckage",
      status: "open",
      property_id: "property-1",
      property: { deleted_at: new Date() },
    });

    const response = await POST(new Request("http://localhost/api/tickets/ticket-1/restore", { method: "POST" }), { params });
    expect(response.status).toBe(409);
    expect(ticketUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 404 when ticket is not soft-deleted", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    ticketFindFirstMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/tickets/ticket-1/restore", { method: "POST" }), { params });
    expect(response.status).toBe(404);
  });
});
