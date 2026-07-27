import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  findAccessibleResidentPortalTicketMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  findAccessibleResidentPortalTicketMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/resident-portal-tickets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/resident-portal-tickets")>()),
  findAccessibleResidentPortalTicket: findAccessibleResidentPortalTicketMock,
}));

import { GET } from "./route";

const residentUser = {
  id: "user-resident",
  company_id: "company-1",
  role: "resident",
  email: "boende@exempel.se",
  name: "Boende Test",
};

describe("resident-portal ticket detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a scoped ticket with public comments only", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    findAccessibleResidentPortalTicketMock.mockResolvedValue({
      id: "ticket-1",
      company_id: "company-1",
      user_id: "owner-1",
      public_reference: "RV-2026-TEST",
      title: "Trasig port",
      description: "Porten fastnar",
      status: "received",
      priority: "normal",
      category: "access",
      reporter_name: "Boende Test",
      reporter_email: "boende@exempel.se",
      reporter_phone: null,
      reporter_unit: "1201",
      created_at: new Date("2026-07-01T10:00:00.000Z"),
      updated_at: new Date("2026-07-01T11:00:00.000Z"),
      property: { name: "Storgatan 1", address: "Storgatan 1", city: "Stockholm" },
      comments: [
        {
          id: "c1",
          body: "Vi tittar på det imorgon",
          created_at: new Date("2026-07-01T11:00:00.000Z"),
          author_type: "staff",
          author_name: "Anna",
          user: { name: "Anna" },
        },
      ],
    });

    const response = await GET(new Request("https://www.revalta.se/api/resident-portal/tickets/ticket-1"), {
      params: Promise.resolve({ id: "ticket-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canComment).toBe(true);
    expect(body.ticket).toMatchObject({
      id: "ticket-1",
      public_reference: "RV-2026-TEST",
      title: "Trasig port",
      status: "received",
    });
    expect(body.ticket.comments).toEqual([
      {
        id: "c1",
        body: "Vi tittar på det imorgon",
        created_at: "2026-07-01T11:00:00.000Z",
        author: { type: "management", name: "Anna" },
      },
    ]);
    expect(findAccessibleResidentPortalTicketMock).toHaveBeenCalledWith(residentUser, "ticket-1");
  });

  it("returns 404 when the ticket is outside resident scope", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    findAccessibleResidentPortalTicketMock.mockResolvedValue(null);

    const response = await GET(new Request("https://www.revalta.se/api/resident-portal/tickets/ticket-x"), {
      params: Promise.resolve({ id: "ticket-x" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Ärendet hittades inte" });
  });

  it("rejects users without a company", async () => {
    getCurrentUserMock.mockResolvedValue({ ...residentUser, company_id: null });

    const response = await GET(new Request("https://www.revalta.se/api/resident-portal/tickets/ticket-1"), {
      params: Promise.resolve({ id: "ticket-1" }),
    });

    expect(response.status).toBe(401);
  });
});
