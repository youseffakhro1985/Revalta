import { describe, expect, it } from "vitest";
import { checkOptimisticConcurrency, concurrencyErrorMessage } from "@/lib/optimistic-concurrency";

describe("optimistic concurrency", () => {
  const current = new Date("2026-07-18T08:00:00.000Z");

  it("accepts an exact matching version", () => {
    expect(checkOptimisticConcurrency(current.toISOString(), current)).toEqual({
      ok: true,
      expected: current,
      current,
    });
  });

  it("rejects a missing version", () => {
    const result = checkOptimisticConcurrency(undefined, current);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("missing_version");
  });

  it("rejects an invalid version", () => {
    const result = checkOptimisticConcurrency("inte-ett-datum", current);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_version");
  });

  it("rejects a stale version", () => {
    const result = checkOptimisticConcurrency("2026-07-18T07:59:00.000Z", current);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("stale_version");
      expect(concurrencyErrorMessage(result.code)).toContain("ändrats av någon annan");
    }
  });
});
