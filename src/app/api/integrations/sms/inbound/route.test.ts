import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ticketFindFirstMock,
  ticketFindManyMock,
  ticketCommentCreateMock,
  integrationEventCreateMock,
} = vi.hoisted(() => ({
  ticketFindFirstMock: vi.fn(),
  ticketFindManyMock: vi.fn(),
  ticketCommentCreateMock: vi.fn(),
  integrationEventCreateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock, findMany: ticketFindManyMock },
    ticketComment: { create: ticketCommentCreateMock },
    integrationEvent: { create: integrationEventCreateMock },
  },
}));

import { POST } from "./route";
import { swedishPhoneVariants } from "@/lib/sms-inbound-phone";

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
    ticketFindManyMock.mockReset();
    ticketFindManyMock.mockResolvedValue([]);
    ticketCommentCreateMock.mockResolvedValue({ id: "comment-1" });
    integrationEventCreateMock.mockResolvedValue({ id: "event-1" });
  });

  it("normalizes Swedish mobile numbers across 07, 46 and +46 forms", () => {
    expect(swedishPhoneVariants("070-111 11 11")).toEqual(expect.arrayContaining([
      "0701111111",
      "46701111111",
      "+46701111111",
    ]));
    expect(swedishPhoneVariants("+46701111111")).toEqual(expect.arrayContaining([
      "0701111111",
      "46701111111",
    ]));
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
    expect(ticketFindManyMock).not.toHaveBeenCalled();
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
        payload: expect.objectContaining({ matchMethod: "reference" }),
      }),
    });
  });

  it("matches the latest open ticket in a single company when only the phone is present", async () => {
    vi.stubEnv("SMS_PROVIDER_WEBHOOK_SECRET", "inbound-secret");
    ticketFindManyMock.mockResolvedValue([
      { id: "closed-1", company_id: "company-1", user_id: "owner-1", status: "closed" },
      { id: "open-1", company_id: "company-1", user_id: "owner-1", status: "in_progress" },
    ]);

    const response = await POST(inboundRequest("from=+46701111111&message=hej igen", "inbound-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, matched: true });
    expect(ticketFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        reporter_phone: { in: expect.arrayContaining(["0701111111", "46701111111", "+46701111111"]) },
      }),
    }));
    expect(ticketCommentCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ ticket_id: "open-1" }),
    });
    expect(integrationEventCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "received",
        company_id: "company-1",
        payload: expect.objectContaining({ matchMethod: "phone" }),
      }),
    });
  });

  it("leaves the message unmatched when the same phone exists in more than one company", async () => {
    vi.stubEnv("SMS_PROVIDER_WEBHOOK_SECRET", "inbound-secret");
    ticketFindManyMock.mockResolvedValue([
      { id: "ticket-a", company_id: "company-1", user_id: "owner-1", status: "new" },
      { id: "ticket-b", company_id: "company-2", user_id: "owner-2", status: "new" },
    ]);

    const response = await POST(inboundRequest("from=0701111111&message=hej", "inbound-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, matched: false });
    expect(ticketCommentCreateMock).not.toHaveBeenCalled();
    expect(integrationEventCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "unmatched", company_id: null }),
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
      data: expect.objectContaining({
        status: "unmatched",
        company_id: null,
        payload: expect.objectContaining({ matchMethod: null }),
      }),
    });
  });
});
