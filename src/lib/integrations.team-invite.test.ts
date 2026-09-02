import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { integrationEventCreateMock } = vi.hoisted(() => ({
  integrationEventCreateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    integrationEvent: {
      create: integrationEventCreateMock,
    },
  },
}));

async function loadIntegrations() {
  vi.resetModules();
  return import("./integrations");
}

describe("secure one-time team invite delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "provider-key");
    vi.stubEnv("EMAIL_FROM", "Revalta <noreply@revalta.se>");
    integrationEventCreateMock.mockResolvedValue({ id: "event-1", status: "sent" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("delivers the invite URL but never persists the one-time token in integration telemetry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const inviteUrl = "https://www.revalta.se/accept-invite?token=one-time-invite-secret";
    const { queueTicketNotification } = await loadIntegrations();

    await queueTicketNotification(
      { company_id: "company-1" },
      {
        ticketId: "invite-1",
        title: "Inbjudan till Revalta",
        recipient: "new.member@example.se",
        event: "updated",
        emailContent: {
          subject: "Du är inbjuden till Revalta",
          text: ["Hej!", "", "Acceptera inbjudan:", inviteUrl].join("\n"),
        },
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const emailPayload = JSON.parse(String(request.body));
    expect(emailPayload.to).toBe("new.member@example.se");
    expect(emailPayload.subject).toBe("Du är inbjuden till Revalta");
    expect(emailPayload.text).toContain(inviteUrl);

    const eventInput = integrationEventCreateMock.mock.calls[0][0];
    expect(eventInput.data).toMatchObject({
      company_id: "company-1",
      type: "email",
      recipient: "new.member@example.se",
      status: "sent",
      payload: {
        ticketId: "invite-1",
        title: "Inbjudan till Revalta",
        recipient: "new.member@example.se",
        event: "updated",
        delivery: { status: "sent", providerId: "email-1" },
      },
    });
    expect(JSON.stringify(eventInput)).not.toContain("one-time-invite-secret");
    expect(JSON.stringify(eventInput)).not.toContain("emailContent");
  });
});
