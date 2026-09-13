import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketFindFirstMock,
  queueSmsNotificationMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  queueSmsNotificationMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/integrations", () => ({
  queueSmsNotification: queueSmsNotificationMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
  },
}));

import { POST } from "./route";

const owner = { id: "user-1", company_id: "company-1", role: "owner" };

describe("ticket SMS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(owner);
    queueSmsNotificationMock.mockResolvedValue({ status: "sent" });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Hiss ur funktion",
      public_reference: "RV-2026-ABC123",
      reporter_phone: "+46701111111",
      assigned_to_id: null,
    });
  });

  it("sends a default update to the reporter phone", async () => {
    const response = await POST(
      new Request("https://www.revalta.se/api/tickets/ticket-1/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "ticket-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, status: "sent", recipient: "+46701111111" });
    expect(queueSmsNotificationMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        ticketId: "ticket-1",
        recipient: "+46701111111",
        message: expect.stringContaining("RV-2026-ABC123"),
      }),
    );
  });

  it("rejects tickets without a phone number", async () => {
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      title: "Trasig lampa",
      public_reference: null,
      reporter_phone: null,
      assigned_to_id: null,
    });

    const response = await POST(
      new Request("https://www.revalta.se/api/tickets/ticket-1/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Vi är på väg" }),
      }),
      { params: Promise.resolve({ id: "ticket-1" }) },
    );

    expect(response.status).toBe(400);
    expect(queueSmsNotificationMock).not.toHaveBeenCalled();
  });
});
