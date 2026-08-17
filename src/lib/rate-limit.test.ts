import { beforeEach, describe, expect, it, vi } from "vitest";

const { cleanupDeleteManyMock, transactionMock } = vi.hoisted(() => ({
  cleanupDeleteManyMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    $transaction: transactionMock,
    rateLimitAttempt: { deleteMany: cleanupDeleteManyMock },
  },
}));

import { checkRateLimit, RATE_LIMIT_TRANSACTION_OPTIONS } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bounds the persistent interactive transaction", async () => {
    const resetAt = new Date(Date.now() + 60_000);
    transactionMock.mockResolvedValue({ allowed: true, remaining: 7, resetAt });

    const result = await checkRateLimit("test:database-options", 8, 60_000);

    expect(result).toEqual({ allowed: true, remaining: 7, resetAt, source: "database" });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(transactionMock.mock.calls[0]?.[1]).toEqual(RATE_LIMIT_TRANSACTION_OPTIONS);
    expect(RATE_LIMIT_TRANSACTION_OPTIONS).toEqual({ maxWait: 1_500, timeout: 2_500 });
  });

  it("falls back deterministically when the persistent limiter is unavailable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    transactionMock.mockRejectedValue(new Error("database unavailable"));
    const key = `test:fallback:${Date.now()}:${Math.random()}`;

    const first = await checkRateLimit(key, 1, 60_000);
    const second = await checkRateLimit(key, 1, 60_000);

    expect(first.source).toBe("memory_fallback");
    expect(first.allowed).toBe(true);
    expect(second.source).toBe("memory_fallback");
    expect(second.allowed).toBe(false);
    expect(consoleError).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });
});
