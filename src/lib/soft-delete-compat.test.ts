import { describe, expect, it } from "vitest";
import { shouldSanitizeSoftDeleteParams } from "@/lib/db";
import { stripDeletedAtKeys } from "@/lib/soft-delete-compat";

describe("soft-delete-compat", () => {
  it("skips raw queries so readiness checks cannot recurse through middleware", () => {
    expect(shouldSanitizeSoftDeleteParams({ model: "Ticket", action: "findMany" })).toBe(true);
    expect(shouldSanitizeSoftDeleteParams({ action: "queryRaw" })).toBe(false);
    expect(shouldSanitizeSoftDeleteParams({ model: "Ticket", action: "queryRaw" })).toBe(false);
    expect(shouldSanitizeSoftDeleteParams({ action: "executeRaw" })).toBe(false);
  });

  it("strips deleted_at from nested where trees", () => {
    const input = {
      where: {
        company_id: "c1",
        deleted_at: null,
        property: { deleted_at: null, status: "active" },
        OR: [{ title: "a" }, { property: { deleted_at: null } }],
      },
      include: {
        projects: { where: { deleted_at: null }, select: { id: true } },
      },
    };

    expect(stripDeletedAtKeys(input)).toEqual({
      where: {
        company_id: "c1",
        property: { status: "active" },
        OR: [{ title: "a" }, { property: {} }],
      },
      include: {
        projects: { where: {}, select: { id: true } },
      },
    });
  });

  it("leaves unrelated keys untouched", () => {
    expect(stripDeletedAtKeys({ take: 10, orderBy: { created_at: "desc" } })).toEqual({
      take: 10,
      orderBy: { created_at: "desc" },
    });
  });
});
