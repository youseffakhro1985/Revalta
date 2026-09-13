import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ticketFindFirstMock,
  ticketCommentCreateMock,
  integrationEventCreateMock,
} = vi.hoisted(() => ({
  ticketFindFirstMock: vi.fn(),
  ticketCommentCreateMock: vi.fn(),
  integrationEventCreateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    ticketComment: { create: ticketCommentCreateMock },
    integrationEvent: { create: integrationEventCreateMock },
  },
}));

import { POST } from "./route";

function inboundRequest(body: string, token?: string) {
  const url = token
    ? `https://www.revalta.se/api/integrations/sms/inbound?token=${token}`
    : "https://www.revalta.se/api/integrations/sms/inbound";
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("inbound SMS webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    ticketFindFirstMock.mockReset();
    ticketCommentCreateMock.mockResolvedValue({ id: "comment-1" });
    integrationEventCreateMock.mockResolvedValue({ id: "event-1" });
  });

  it("returns 503 when the inbound secret is missing", async () => {
    vi.stubEnv("SMS_PROVIDER_WEBHOOK_SECRET", "");
    const response = await POST(inboundRequest("from=46701111111&message=hej", "guess"));
    expect(response.status).toBe(503);
    expect(ticketCommentCreateMock).not.toHaveBeenCalled();
  });

  it("rejects an incorrect token", async () => {
    vi.stubEnv("SMS_PROVIDER_WEBHOOK_SECRET", "inbound-secret");
    const response = await POST(inboundRequest("from=46701111111&message=hej", "wrong"));
    expect(response.status).toBe(401);
  });

  it("attaches a resident comment when the message contains a public reference", async () => {
    vi.stubEnv("SMS_PROVIDER_WEBHOOK_SECRET", "inbound-secret");
    ticketFindFirstMock.mockResolvedValue({ id: "ticket-1", company_id: "company-1", user_id: "owner-1" });

    const response = await POST(
      inboundRequest("from=46701111111&message=Hissen står. RV-2026-ABC123", "inbound-secret"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, matched: true });
    expect(ticketCommentCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticket_id: "ticket-1",
        user_id: "owner-1",
        author_type: "resident",
        author_name: "46701111111",
      }),
    });
    expect(integrationEventCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "sms",
        status: "received",
        company_id: "company-1",
      }),
    });
  });

  it("records unmatched inbound messages without creating a comment", async () => {
    vi.stubEnv("SMS_PROVIDER_WEBHOOK_SECRET", "inbound-secret");
    const response = await POST(inboundRequest("from=46701111111&message=hej", "inbound-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, matched: false });
    expect(ticketCommentCreateMock).not.toHaveBeenCalled();
    expect(integrationEventCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "unmatched", company_id: null }),
    });
  });
});
