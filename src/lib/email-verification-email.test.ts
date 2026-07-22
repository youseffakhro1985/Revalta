import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmailVerificationEmail } from "./email-verification-email";

describe("sendEmailVerificationEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.EMAIL_PROVIDER_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("requires an email provider configuration", async () => {
    await expect(sendEmailVerificationEmail("test@example.com", "token")).rejects.toThrow("not configured");
  });

  it("sends a one-time verification link without exposing raw HTML", async () => {
    process.env.EMAIL_PROVIDER_API_KEY = "test-key";
    process.env.EMAIL_FROM = "Revalta <no-reply@revalta.se>";
    process.env.NEXT_PUBLIC_APP_URL = "https://www.revalta.se/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await sendEmailVerificationEmail("test+user@example.com", "secure token");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, options] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(options?.body));
    expect(payload.html).toContain("https://www.revalta.se/verify-email?token=secure%20token");
    expect(payload.html).toContain("test+user@example.com");
    expect(payload.subject).toContain("Verifiera");
  });
});
