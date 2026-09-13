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

vi.mock("@/lib/app-url", () => ({
  getPublicAppUrl: () => "https://www.revalta.se",
}));

import { sendPasswordResetEmail } from "./password-reset-email";

describe("sendPasswordResetEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv("NODE_ENV", "production");
    integrationEventCreateMock.mockResolvedValue({ id: "event-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("records a sent delivery without persisting the one-time token", async () => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "provider-key");
    vi.stubEnv("EMAIL_FROM", "noreply@revalta.se");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendPasswordResetEmail("owner@example.se", "one-time-reset-token");

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const emailPayload = JSON.parse(String(request.body));
    expect(emailPayload.to).toEqual(["owner@example.se"]);
    expect(emailPayload.html).toContain("https://www.revalta.se/reset-password?token=one-time-reset-token");

    const eventInput = integrationEventCreateMock.mock.calls[0][0];
    expect(eventInput.data).toMatchObject({
      type: "email",
      recipient: "owner@example.se",
      status: "sent",
      payload: {
        event: "password_reset",
        delivery: { status: "sent", providerId: "email-1" },
      },
    });
    expect(JSON.stringify(eventInput)).not.toContain("one-time-reset-token");
  });

  it("records provider rejection details without the Resend message body", async () => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "provider-key");
    vi.stubEnv("EMAIL_FROM", "noreply@revalta.se");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        name: "validation_error",
        message: "upstream secret about owner@example.se",
      }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    await expect(sendPasswordResetEmail("owner@example.se", "one-time-reset-token")).rejects.toMatchObject({
      name: "PasswordResetDeliveryError",
      reason: "provider_rejected",
      providerStatus: 403,
      providerCode: "validation_error",
    });

    const eventInput = integrationEventCreateMock.mock.calls[0][0];
    expect(eventInput.data.status).toBe("failed");
    expect(eventInput.data.payload.delivery).toEqual({
      status: "failed",
      providerId: null,
      reason: "provider_rejected",
      providerStatus: 403,
      providerCode: "validation_error",
    });
    expect(JSON.stringify(eventInput)).not.toContain("upstream secret");
    expect(JSON.stringify(eventInput)).not.toContain("one-time-reset-token");
  });

  it("records not_configured when credentials are missing", async () => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");

    await expect(sendPasswordResetEmail("owner@example.se", "one-time-reset-token")).rejects.toMatchObject({
      reason: "not_configured",
    });
    expect(integrationEventCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "failed",
        payload: {
          event: "password_reset",
          delivery: { status: "failed", providerId: null, reason: "not_configured" },
        },
      }),
    });
  });
});
