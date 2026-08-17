import { describe, expect, it, vi } from "vitest";

const { prismaUseMock } = vi.hoisted(() => ({ prismaUseMock: vi.fn() }));

vi.mock("@prisma/client", () => ({
  PrismaClient: class PrismaClientMock {
    $use = prismaUseMock;
  },
}));

vi.mock("@/lib/soft-delete-compat", () => ({
  sanitizeSoftDeleteArgs: vi.fn(async (_client, _model, _action, args) => args),
}));

import { shouldSanitizeSoftDeleteParams } from "./db";

describe("shouldSanitizeSoftDeleteParams", () => {
  it("bypasses compatibility inspection for the relation-free RateLimitAttempt model", () => {
    expect(shouldSanitizeSoftDeleteParams({ model: "RateLimitAttempt", action: "deleteMany" })).toBe(false);
    expect(shouldSanitizeSoftDeleteParams({ model: "RateLimitAttempt", action: "count" })).toBe(false);
    expect(shouldSanitizeSoftDeleteParams({ model: "RateLimitAttempt", action: "create" })).toBe(false);
  });

  it("keeps compatibility inspection for normal model operations", () => {
    expect(shouldSanitizeSoftDeleteParams({ model: "Property", action: "findMany" })).toBe(true);
    expect(shouldSanitizeSoftDeleteParams({ model: "User", action: "findUnique" })).toBe(true);
  });

  it("still bypasses raw and connection-level operations", () => {
    expect(shouldSanitizeSoftDeleteParams({ action: "queryRaw" })).toBe(false);
    expect(shouldSanitizeSoftDeleteParams({ model: "Property", action: "queryRaw" })).toBe(false);
  });
});
