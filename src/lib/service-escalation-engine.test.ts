import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  default: {},
}));

import { isDedupeKeyConflict } from "./service-escalation-engine";

describe("isDedupeKeyConflict", () => {
  // Regression coverage for the runServiceEscalations race: two
  // concurrent/retried invocations can both pass the pre-create
  // hasExistingEscalation check before either commits, so the second
  // create() hits the (company_id, dedupe_key) unique constraint and throws
  // P2002. That must be recognized as "someone else already owns this
  // dedupeKey" and skipped, not treated as a fatal error that aborts the
  // rest of the batch.
  it("recognizes a Prisma P2002 unique-constraint violation", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
    expect(isDedupeKeyConflict(error)).toBe(true);
  });

  it("does not swallow unrelated Prisma errors", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", { code: "P2003", clientVersion: "test" });
    expect(isDedupeKeyConflict(error)).toBe(false);
  });

  it("does not swallow non-Prisma errors", () => {
    expect(isDedupeKeyConflict(new Error("network timeout"))).toBe(false);
    expect(isDedupeKeyConflict("some string")).toBe(false);
  });
});
