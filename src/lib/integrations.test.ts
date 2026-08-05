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

describe("queueEmailVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "production");
    integrationEventCreateMock.mockResolvedValue({ id: "event-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("delivers the one-time verification link without persisting the token", async () => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "provider-key");
    vi.stubEnv("EMAIL_FROM", "Revalta <noreply@revalta.se>");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const verificationUrl = "https://www.revalta.se/verify-email?token=one-time-secret";
    const { queueEmailVerification } = await loadIntegrations();

    await queueEmailVerification(
      { company_id: "company-1" },
      { recipient: "owner@example.se", verificationUrl },
    );

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const emailPayload = JSON.parse(String(request.body));
    expect(emailPayload.to).toBe("owner@example.se");
    expect(emailPayload.text).toContain(verificationUrl);
    expect(emailPayload.text).toContain("Länken gäller i 24 timmar");

    const eventInput = integrationEventCreateMock.mock.calls[0][0];
    expect(eventInput.data).toMatchObject({
      company_id: "company-1",
      type: "email",
      recipient: "owner@example.se",
      status: "sent",
      payload: {
        event: "email_verification",
        delivery: { status: "sent", providerId: "email-1" },
      },
    });
    expect(JSON.stringify(eventInput)).not.toContain("one-time-secret");
  });

  it("records a hard failure in production when email is not configured", async () => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { queueEmailVerification } = await loadIntegrations();

    await queueEmailVerification(
      { company_id: "company-1" },
      {
        recipient: "owner@example.se",
        verificationUrl: "https://www.revalta.se/verify-email?token=one-time-secret",
      },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(integrationEventCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "failed",
        payload: {
          event: "email_verification",
          delivery: { status: "failed", providerId: null },
        },
      }),
    });
  });
});
