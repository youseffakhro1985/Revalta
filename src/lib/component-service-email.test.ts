import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverServiceEmail } from "./component-service-email";

const component = {
  id: "asset-1",
  property_id: "property-1",
  component_name: '<script>alert("x")</script>',
  next_service_at: new Date("2026-07-18T08:00:00.000Z"),
  property_name: "Brf <Premium>",
  property_address: "Testvägen 1 & 2",
  property_city: "Göteborg",
};

describe("deliverServiceEmail", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "Revalta <aviseringar@revalta.se>");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.revalta.se/");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("skickar ett privat utskick till exakt en mottagare", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":"email-1"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await deliverServiceEmail("admin@example.se", [component], 30, "all");

    expect(result).toEqual({
      email: "admin@example.se",
      mode: "all",
      status: "sent",
      providerResponse: '{"id":"email-1"}',
      error: null,
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(request.body));
    expect(payload.to).toEqual(["admin@example.se"]);
    expect(payload.cc).toBeUndefined();
    expect(payload.bcc).toBeUndefined();
  });

  it("HTML-escapar komponent- och fastighetsdata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await deliverServiceEmail("admin@example.se", [component], 30, "all");

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(request.body));
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(payload.html).toContain("Brf &lt;Premium&gt;");
    expect(payload.html).toContain("Testvägen 1 &amp; 2");
    expect(payload.html).toContain("https://www.revalta.se/dashboard/fastigheter/property-1/komponenter/asset-1");
  });

  it("returnerar ett JSON-säkert fel när leverantören saknas", async () => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "");

    const result = await deliverServiceEmail("admin@example.se", [component], 30, "all");

    expect(result).toEqual({
      email: "admin@example.se",
      mode: "all",
      status: "failed",
      providerResponse: null,
      error: "E-postleverantören är inte konfigurerad",
    });
  });

  it("begränsar och loggar leverantörsfel utan att kasta vidare", async () => {
    const providerBody = "x".repeat(500);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(providerBody, { status: 429 })));

    const result = await deliverServiceEmail("admin@example.se", [component], 30, "overdue_only");

    expect(result.status).toBe("failed");
    expect(result.providerResponse).toBeNull();
    expect(result.error).toContain("E-postleverantören svarade 429");
    expect(result.error?.length).toBeLessThan(380);
  });
});
