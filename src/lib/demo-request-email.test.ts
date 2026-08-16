import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverDemoRequest } from "./demo-request-email";

const request = {
  name: 'Test <Person>',
  email: "person@example.se",
  company: 'Bolag & <script>alert("x")</script>',
  phone: "0701234567",
  role: "Förvaltare",
  portfolio: "12 fastigheter",
  message: "Visa arbetsorder & ekonomi",
};

describe("deliverDemoRequest", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "Revalta <aviseringar@revalta.se>");
    vi.stubEnv("DEMO_REQUEST_TO", "sales@example.se");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("skickar endast till serverns konfigurerade demo-mottagare", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":"email-1"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deliverDemoRequest(request)).resolves.toEqual({ ok: true });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(options.body));
    expect(payload.to).toEqual(["sales@example.se"]);
    expect(payload.reply_to).toBe("person@example.se");
    expect(payload.cc).toBeUndefined();
    expect(payload.bcc).toBeUndefined();
  });

  it("HTML-escapar all användarstyrd text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await deliverDemoRequest(request);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(options.body));
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain("Test &lt;Person&gt;");
    expect(payload.html).toContain("Bolag &amp; &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(payload.html).toContain("Visa arbetsorder &amp; ekonomi");
  });

  it("failar stängt när demo-mottagaren inte är konfigurerad", async () => {
    vi.stubEnv("DEMO_REQUEST_TO", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(deliverDemoRequest(request)).resolves.toEqual({ ok: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returnerar provider_error utan att kasta när leverantören nekar leverans", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })));

    await expect(deliverDemoRequest(request)).resolves.toEqual({ ok: false, reason: "provider_error" });
  });
});
