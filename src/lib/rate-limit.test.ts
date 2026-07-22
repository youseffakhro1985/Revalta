import { beforeEach, describe, expect, it, vi } from "vitest";

const { transactionMock } = vi.hoisted(() => ({ transactionMock: vi.fn() }));

vi.mock("@/lib/db", () => ({
  default: {
    $transaction: transactionMock,
    rateLimitAttempt: { deleteMany: vi.fn() },
  },
}));

import { checkRateLimit } from "@/lib/rate-limit";

describe("persistent rate limiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("fails closed when the shared database limiter is unavailable", async () => {
    transactionMock.mockRejectedValue(new Error("database unavailable"));

    const result = await checkRateLimit("login:ip:203.0.113.10", 5, 15 * 60 * 1000);

    expect(result).toMatchObject({ allowed: false, remaining: 0, source: "unavailable" });
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
  });
});
