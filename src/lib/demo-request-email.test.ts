import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverDemoRequest, demoRequestEmailHtml, type DemoRequest } from "./demo-request-email";

const request: DemoRequest = {
  name: "Ada <script>",
  email: "ada@example.com",
  company: "Example & Co",
  phone: "+46 70 000 00 00",
  role: "Förvaltare",
  portfolio: "15 fastigheter",
  message: "Hej <b>team</b>",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("demo request email", () => {
  it("escapes visitor-controlled HTML", () => {
    const html = demoRequestEmailHtml(request);
    expect(html).toContain("Ada &lt;script&gt;");
    expect(html).toContain("Example &amp; Co");
    expect(html).toContain("Hej &lt;b&gt;team&lt;/b&gt;");
    expect(html).not.toContain("<script>");
  });

  it("fails closed when delivery configuration is incomplete", async () => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "noreply@revalta.se");
    vi.stubEnv("DEMO_REQUEST_TO", "");
    await expect(deliverDemoRequest(request)).resolves.toEqual({ ok: false, reason: "not_configured" });
  });

  it("sends only to the server-side recipient, uses reply-to and forwards a stable idempotency key", async () => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "secret");
    vi.stubEnv("EMAIL_FROM", "noreply@revalta.se");
    vi.stubEnv("DEMO_REQUEST_TO", "sales@revalta.se");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));

    await expect(deliverDemoRequest(request, { idempotencyKey: "demo-request/lead_123" })).resolves.toEqual({ ok: true, providerId: "email_123" });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    const headers = new Headers(init?.headers);
    expect(body.to).toEqual(["sales@revalta.se"]);
    expect(body.reply_to).toBe("ada@example.com");
    expect(body.to).not.toContain(request.email);
    expect(headers.get("idempotency-key")).toBe("demo-request/lead_123");
  });

  it("classifies explicit provider rejections as retryable without exposing provider response data", async () => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "secret");
    vi.stubEnv("EMAIL_FROM", "noreply@revalta.se");
    vi.stubEnv("DEMO_REQUEST_TO", "sales@revalta.se");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("provider-internal-detail", { status: 503 }));

    await expect(deliverDemoRequest(request)).resolves.toEqual({ ok: false, reason: "provider_rejected" });
  });

  it("classifies network failures separately from provider rejections", async () => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "secret");
    vi.stubEnv("EMAIL_FROM", "noreply@revalta.se");
    vi.stubEnv("DEMO_REQUEST_TO", "sales@revalta.se");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network unavailable"));

    await expect(deliverDemoRequest(request)).resolves.toEqual({ ok: false, reason: "network_error" });
  });
});
