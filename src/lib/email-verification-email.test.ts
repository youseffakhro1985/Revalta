import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmailVerificationEmail } from "./email-verification-email";

describe("sendEmailVerificationEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("requires an email provider configuration", async () => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");

    await expect(sendEmailVerificationEmail("test@example.com", "token")).rejects.toThrow("not configured");
  });

  it("sends a one-time verification link with the configured sender", async () => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "Revalta <no-reply@revalta.se>");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.revalta.se/");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await sendEmailVerificationEmail("test+user@example.com", "secure token");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(options?.body));

    expect(url).toBe("https://api.resend.com/emails");
    expect(options?.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(payload.from).toBe("Revalta <no-reply@revalta.se>");
    expect(payload.to).toEqual(["test+user@example.com"]);
    expect(payload.html).toContain("https://www.revalta.se/verify-email?token=secure%20token");
    expect(payload.subject).toContain("Verifiera");
  });
});
