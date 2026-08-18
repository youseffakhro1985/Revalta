import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  findAccessibleResidentPortalTicketMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  findAccessibleResidentPortalTicketMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/resident-portal-tickets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/resident-portal-tickets")>()),
  findAccessibleResidentPortalTicket: findAccessibleResidentPortalTicketMock,
}));

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const residentUser = {
  id: "user-resident",
  company_id: "company-1",
  role: "resident",
  email: "boende@exempel.se",
  name: "Boende Test",
};

function request(ticketId = "ticket-1") {
  return new Request(`https://www.revalta.se/api/resident-portal/tickets/${ticketId}`, {
    headers: { "x-request-id": requestId },
  });
}

describe("resident-portal ticket detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
  });

  it("returns a scoped ticket with public comments, request correlation and private caching", async () => {
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

    const response = await GET(request(), { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
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
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "resident ticket detail completed",
      expect.objectContaining({
        event: "resident_tickets.detail.completed",
        userId: "user-resident",
        companyId: "company-1",
        ticketId: "ticket-1",
        commentCount: 1,
      }),
    );
    const logged = JSON.stringify(loggerInfoMock.mock.calls);
    expect(logged).not.toContain("Trasig port");
    expect(logged).not.toContain("Porten fastnar");
    expect(logged).not.toContain("boende@exempel.se");
    expect(logged).not.toContain("Vi tittar på det imorgon");
  });

  it("returns a correlated 404 without logging an unverified ticket id", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    findAccessibleResidentPortalTicketMock.mockResolvedValue(null);

    const response = await GET(request("external-secret-ticket"), {
      params: Promise.resolve({ id: "external-secret-ticket" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: "Ärendet hittades inte",
      errorCode: "NOT_FOUND",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-secret-ticket");
  });

  it("returns a stable correlated 401 for users without company membership", async () => {
    getCurrentUserMock.mockResolvedValue({ ...residentUser, company_id: null });

    const response = await GET(request(), { params: Promise.resolve({ id: "ticket-1" }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Obehörig",
      errorCode: "UNAUTHORIZED",
      requestId,
    });
    expect(findAccessibleResidentPortalTicketMock).not.toHaveBeenCalled();
  });

  it("returns a safe correlated 500 without leaking internal dependency details", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("postgres://user:secret@db.internal/revalta"));

    const response = await GET(request(), { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "resident ticket detail failed",
      expect.any(Error),
      expect.objectContaining({ event: "resident_tickets.detail.failed" }),
    );
  });
});
