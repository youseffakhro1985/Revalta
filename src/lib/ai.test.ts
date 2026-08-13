import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeTicket } from "./ai";

describe("analyzeTicket", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("AI_PROVIDER_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("passes an AbortSignal so a hanging provider fails fast instead of stalling", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ category: "vvs", priority: "high" }) } }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await analyzeTicket("Vattenläcka i badrummet");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("falls back to the deterministic Swedish analysis when the provider call is aborted", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    global.fetch = vi.fn().mockRejectedValue(abortError) as unknown as typeof fetch;

    const result = await analyzeTicket("Akut vattenläcka i källaren, stort vatteninflöde");

    // Falls back to the regex-based deterministic classifier rather than throwing
    // or hanging — same contract as any other fetch failure in this function.
    expect(result.category).toBe("vvs");
    expect(result.priority).toBe("urgent");
  });

  it("uses the deterministic analysis directly when no API key is configured", async () => {
    vi.unstubAllEnvs();
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await analyzeTicket("Trasig lampa i trapphuset");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.category).toBe("electricity");
  });
});
