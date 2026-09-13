import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeDocument, analyzeTicket, documentTextSnippet, LIBRARY_DOCUMENT_CATEGORIES, WORK_ORDER_DOCUMENT_CATEGORIES } from "./ai";

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
    vi.stubEnv("AI_PROVIDER_API_KEY", "");
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await analyzeTicket("Trasig lampa i trapphuset");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.category).toBe("electricity");
  });
});

describe("analyzeDocument", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("keeps an explicit staff category instead of reclassifying", async () => {
    vi.stubEnv("AI_PROVIDER_API_KEY", "");    const result = await analyzeDocument({
      fileName: "faktura-123.pdf",
      allowedCategories: WORK_ORDER_DOCUMENT_CATEGORIES,
      existingCategory: "before",
    });
    expect(result.category).toBe("before");
    expect(result.confidence).toBe(1);
  });

  it("classifies work-order invoices from the filename without sending bytes", async () => {
    vi.stubEnv("AI_PROVIDER_API_KEY", "");    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await analyzeDocument({
      fileName: "Faktura-leverantör-2026.pdf",
      textSnippet: "",
      allowedCategories: WORK_ORDER_DOCUMENT_CATEGORIES,
      existingCategory: "other",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.category).toBe("invoice");
  });

  it("maps library contracts from Swedish filenames", async () => {
    vi.stubEnv("AI_PROVIDER_API_KEY", "");    const result = await analyzeDocument({
      fileName: "Hyresavtal-Storgatan-12.pdf",
      allowedCategories: LIBRARY_DOCUMENT_CATEGORIES,
    });
    expect(result.category).toBe("contract");
  });
});

describe("documentTextSnippet", () => {
  it("returns UTF-8 text for text files and never dumps binary", () => {
    expect(documentTextSnippet(Buffer.from("Hyresvillkor för lokalen"), "text/plain")).toContain("Hyresvillkor");
    expect(documentTextSnippet(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01]), "application/pdf")).toBe("");
  });
});

describe("untrusted provider response validation", () => {
  beforeEach(() => vi.stubEnv("AI_PROVIDER_API_KEY", "synthetic-test-key"));
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  function provider(content: string) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }))));
  }
  it.each(["null", "[]", "42", '"text"', "invalid-json"])("uses deterministic fallback for malformed %s", async (content) => {
    provider(content);
    expect(await analyzeTicket("Akut vattenläcka")).toMatchObject({ category: "vvs", priority: "urgent" });
  });
  it.each([-1, 2, "0.9", null, {}, []])("rejects invalid confidence %j without persisting invalid enums or objects", async (confidence) => {
    provider(JSON.stringify({ category: "injected-category", priority: "injected-priority", confidence, summary: {}, recommendedAction: ["invalid"] }));
    const result = await analyzeTicket("Akut vattenläcka");
    expect(result).toMatchObject({ category: "vvs", priority: "urgent", confidence: 0.86, summary: "Akut vattenläcka" });
    expect(typeof result.recommendedAction).toBe("string");
  });
  it("rejects JSON numeric overflow", async () => {
    provider('{"confidence":1e999,"priority":"urgent"}');
    expect((await analyzeTicket("Akut vattenläcka")).confidence).toBe(0.86);
  });
  it("preserves valid classifications and bounds provider text", async () => {
    provider(JSON.stringify({ category: "cleaning", priority: "low", confidence: 0, summary: "s".repeat(5000), recommendedAction: "a".repeat(5000) }));
    const result = await analyzeTicket("Städning");
    expect(result).toMatchObject({ category: "cleaning", priority: "low", confidence: 0 });
    expect(result.summary).toHaveLength(500);
    expect(result.recommendedAction).toHaveLength(1000);
  });
  it("also validates document confidence, category type and summary", async () => {
    provider(JSON.stringify({ category: { value: "invoice" }, confidence: 9, summary: {} }));
    const result = await analyzeDocument({ fileName: "faktura.pdf", allowedCategories: LIBRARY_DOCUMENT_CATEGORIES });
    expect(result).toEqual({ category: "invoice", confidence: 0.84, summary: "faktura.pdf" });
  });
});
