import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  findAccessibleResidentPortalTicketMock,
  ticketCommentCreateMock,
  writeAuditLogMock,
  queueTicketNotificationMock,
  checkRateLimitMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  findAccessibleResidentPortalTicketMock: vi.fn(),
  ticketCommentCreateMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  queueTicketNotificationMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/resident-portal-tickets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/resident-portal-tickets")>()),
  findAccessibleResidentPortalTicket: findAccessibleResidentPortalTicketMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/integrations", () => ({ queueTicketNotification: queueTicketNotificationMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticketComment: { create: ticketCommentCreateMock },
  },
}));

import { POST } from "./route";

const residentUser = {
  id: "user-resident",
  company_id: "company-1",
  role: "resident",
  email: "boende@exempel.se",
  name: "Boende Test",
};

const ticket = {
  id: "ticket-1",
  company_id: "company-1",
  user_id: "owner-1",
  title: "Trasig port",
  reporter_name: "Boende Test",
  reporter_email: "boende@exempel.se",
  comments: [],
};

describe("resident-portal ticket comments route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() });
    findAccessibleResidentPortalTicketMock.mockResolvedValue(ticket);
    writeAuditLogMock.mockResolvedValue(undefined);
    queueTicketNotificationMock.mockResolvedValue(undefined);
    ticketCommentCreateMock.mockResolvedValue({
      id: "comment-1",
      body: "Porten är fortfarande trasig",
      created_at: new Date("2026-07-02T09:00:00.000Z"),
      author_type: "resident",
      author_name: "Boende Test",
    });
  });

  it("lets a resident post a public comment on their ticket", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);

    const response = await POST(
      new Request("https://www.revalta.se/api/resident-portal/tickets/ticket-1/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Porten är fortfarande trasig" }),
      }),
      { params: Promise.resolve({ id: "ticket-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.comment).toMatchObject({
      id: "comment-1",
      body: "Porten är fortfarande trasig",
      author: { type: "resident", name: "Boende Test" },
    });
    expect(ticketCommentCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ticket_id: "ticket-1",
        is_internal: false,
        author_type: "resident",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      residentUser,
      expect.objectContaining({ action: "resident_portal.comment_created" }),
    );
  });

  it("rejects empty comments", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);

    const response = await POST(
      new Request("https://www.revalta.se/api/resident-portal/tickets/ticket-1/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "   " }),
      }),
      { params: Promise.resolve({ id: "ticket-1" }) },
    );

    expect(response.status).toBe(400);
    expect(ticketCommentCreateMock).not.toHaveBeenCalled();
  });

  it("denies viewers from commenting", async () => {
    getCurrentUserMock.mockResolvedValue({
      ...residentUser,
      role: "viewer",
    });

    const response = await POST(
      new Request("https://www.revalta.se/api/resident-portal/tickets/ticket-1/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Hej" }),
      }),
      { params: Promise.resolve({ id: "ticket-1" }) },
    );

    expect(response.status).toBe(403);
  });
});
