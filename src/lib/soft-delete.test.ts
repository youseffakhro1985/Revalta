import { describe, expect, it } from "vitest";
import { notDeleted, withNotDeleted } from "@/lib/soft-delete";

describe("soft-delete helpers", () => {
  it("exposes notDeleted fragment", () => {
    expect(notDeleted).toEqual({ deleted_at: null });
  });

  it("merges notDeleted into where clauses", () => {
    expect(withNotDeleted({ company_id: "c1", status: "active" })).toEqual({
      company_id: "c1",
      status: "active",
      deleted_at: null,
    });
  });
});
