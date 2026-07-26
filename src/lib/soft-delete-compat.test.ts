import { describe, expect, it } from "vitest";
import { stripDeletedAtKeys } from "@/lib/soft-delete-compat";

describe("soft-delete-compat", () => {
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
