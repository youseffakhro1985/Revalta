import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  transactionMock,
  cleanupDeleteManyMock,
  executeRawMock,
  attemptDeleteManyMock,
  countMock,
  findFirstMock,
  createMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  cleanupDeleteManyMock: vi.fn(),
  executeRawMock: vi.fn(),
  attemptDeleteManyMock: vi.fn(),
  countMock: vi.fn(),
  findFirstMock: vi.fn(),
  createMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    $transaction: transactionMock,
    rateLimitAttempt: {
      deleteMany: cleanupDeleteManyMock,
    },
  },
}));

vi.mock("@/lib/structured-logger", () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: loggerWarnMock,
    error: vi.fn(),
  })),
}));

import { checkRateLimit, getClientIp } from "./rate-limit";

function transactionClient() {
  return {
    $executeRaw: executeRawMock,
    rateLimitAttempt: {
      deleteMany: attemptDeleteManyMock,
      count: countMock,
      findFirst: findFirstMock,
      create: createMock,
    },
  };
}

describe("persistent rate limiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeRawMock.mockResolvedValue(1);
    attemptDeleteManyMock.mockResolvedValue({ count: 0 });
    countMock.mockResolvedValue(0);
    findFirstMock.mockResolvedValue(null);
    createMock.mockResolvedValue({ id: "attempt-1" });
    cleanupDeleteManyMock.mockResolvedValue({ count: 0 });
    transactionMock.mockImplementation(async (callback: (tx: ReturnType<typeof transactionClient>) => unknown) =>
      callback(transactionClient()),
    );
  });

  it("uses the database-backed limiter when persistence is available", async () => {
    const result = await checkRateLimit("public-ticket:192.0.2.10", 5, 60_000);

    expect(result).toMatchObject({
      allowed: true,
      remaining: 4,
      source: "database",
    });
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith({
      data: { key_hash: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("returns the oldest persisted reset time when the limit is reached", async () => {
    const oldest = new Date("2026-07-27T20:00:00.000Z");
    countMock.mockResolvedValue(5);
    findFirstMock.mockResolvedValue({ created_at: oldest });

    const result = await checkRateLimit("public-ticket:192.0.2.11", 5, 60_000);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.source).toBe("database");
    expect(result.resetAt).toEqual(new Date(oldest.getTime() + 60_000));
    expect(createMock).not.toHaveBeenCalled();
  });

  it("falls back to a bounded memory bucket when the database is unavailable", async () => {
    transactionMock.mockRejectedValue(new Error("database unavailable"));

    const result = await checkRateLimit("public-ticket:198.51.100.20", 2, 60_000);

    expect(result).toMatchObject({
      allowed: true,
      remaining: 1,
      source: "memory_fallback",
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "persistent rate limiter unavailable; using bounded memory fallback",
      expect.objectContaining({
        eventCode: "rate_limit.database_unavailable",
        limit: 2,
        windowMs: 60_000,
        fallbackAllowed: true,
        fallbackRemaining: 1,
        error: expect.any(Error),
      }),
    );
  });

  it("does not expose the original key or its IP address in fallback log context", async () => {
    transactionMock.mockRejectedValue(new Error("database unavailable"));
    const sensitiveKey = "public-ticket:203.0.113.77";

    await checkRateLimit(sensitiveKey, 5, 60_000);

    const serializedCalls = JSON.stringify(loggerWarnMock.mock.calls);
    expect(serializedCalls).not.toContain(sensitiveKey);
    expect(serializedCalls).not.toContain("203.0.113.77");
  });

  it("uses the first forwarded address as the client IP", () => {
    const request = new Request("https://www.revalta.se/api/public/tickets", {
      headers: { "x-forwarded-for": "198.51.100.10, 198.51.100.11" },
    });

    expect(getClientIp(request)).toBe("198.51.100.10");
  });
});
