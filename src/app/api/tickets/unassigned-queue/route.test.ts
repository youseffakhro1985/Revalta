import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, ticketFindManyMock, userFindManyMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindManyMock: vi.fn(),
  userFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findMany: ticketFindManyMock },
    user: { findMany: userFindManyMock },
  },
}));

import { GET } from "./route";

describe("GET /api/tickets/unassigned-queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ticketFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([]);
  });

  it("denies technicians from reading the unassigned ticket queue", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att tilldela ärenden");
    expect(ticketFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing tickets or assignee emails", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(ticketFindManyMock).not.toHaveBeenCalled();
    expect(userFindManyMock).not.toHaveBeenCalled();
  });

  it("lists unassigned open tickets and assignable staff", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-1", company_id: "company-1", role: "manager" });
    ticketFindManyMock.mockResolvedValue([{
      id: "ticket-1",
      title: "Läckande kran",
      status: "new",
      priority: "urgent",
      public_reference: "RV-1001",
      created_at: new Date("2026-09-14T08:00:00.000Z"),
      property: { id: "prop-1", name: "Storgatan 12" },
    }]);
    userFindManyMock.mockResolvedValue([
      { id: "tech-1", name: "Tina Tekniker", email: "tina@example.com", role: "technician" },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(ticketFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        assigned_to_id: null,
        deleted_at: null,
      }),
    }));
    expect(ticketFindManyMock.mock.calls[0]?.[0].where.company_id).toBe("company-1");
    expect(body.tickets[0]).toEqual(expect.objectContaining({
      id: "ticket-1",
      href: "/dashboard/felanmalan/ticket-1",
      publicReference: "RV-1001",
      status: "new",
      statusLabel: "Ny",
    }));
    expect(body.assignees).toEqual([expect.objectContaining({ id: "tech-1", name: "Tina Tekniker" })]);
    expect(body.selfId).toBe("mgr-1");
  });

  it("normalizes leftover assigned tickets to received", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-1", company_id: "company-1", role: "manager" });
    ticketFindManyMock.mockResolvedValue([{
      id: "ticket-2",
      title: "Trasig dörr",
      status: "assigned",
      priority: "normal",
      public_reference: "RV-1002",
      created_at: new Date("2026-09-14T08:00:00.000Z"),
      property: { id: "prop-1", name: "Storgatan 12" },
    }]);

    const response = await GET();
    const body = await response.json();

    expect(body.tickets[0]).toEqual(expect.objectContaining({
      status: "received",
      statusLabel: "Mottagen",
    }));
  });
});
