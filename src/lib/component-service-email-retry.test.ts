import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverServiceEmail } from "./component-service-email";

const component = {
  id: "asset-1",
  property_id: "property-1",
  component_name: "Ventilationsaggregat",
  next_service_at: new Date("2026-07-18T08:00:00.000Z"),
  property_name: "Brf Revalta",
  property_address: "Testvägen 1",
  property_city: "Göteborg",
};

async function settleRetryTimers() {
  await vi.runAllTimersAsync();
}

describe("deliverServiceEmail retry/backoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "Revalta <aviseringar@revalta.se>");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.revalta.se/");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("återhämtar en 429-leverans på andra försöket", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response('{"id":"email-2"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const delivery = deliverServiceEmail("admin@example.se", [component], 30, "all");
    await settleRetryTimers();
    const result = await delivery;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: "sent",
      attempts: 2,
      retryable: false,
      error: null,
      providerResponse: '{"id":"email-2"}',
    });
  });

  it("gör högst tre försök vid återkommande 5xx-fel", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("temporary outage", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const delivery = deliverServiceEmail("admin@example.se", [component], 30, "all");
    await settleRetryTimers();
    const result = await delivery;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      status: "failed",
      attempts: 3,
      retryable: true,
      providerResponse: null,
    });
    expect(result.error).toContain("503");
  });

  it("återförsöker inte permanenta 4xx-fel", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("invalid sender", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await deliverServiceEmail("admin@example.se", [component], 30, "all");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: "failed",
      attempts: 1,
      retryable: false,
      providerResponse: null,
    });
    expect(result.error).toContain("400");
  });

  it("gör inga nätverksförsök när leverantören inte är konfigurerad", async () => {
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await deliverServiceEmail("admin@example.se", [component], 30, "all");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      email: "admin@example.se",
      mode: "all",
      status: "failed",
      providerResponse: null,
      error: "E-postleverantören är inte konfigurerad",
      attempts: 0,
      retryable: false,
    });
  });
});
