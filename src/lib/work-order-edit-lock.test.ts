import { describe, expect, it } from "vitest";
import { parseWorkOrderLockInput, WorkOrderLockError } from "@/lib/work-order-edit-lock";

describe("work order lock input", () => {
  it("requires both an edit token and a version stamp", () => {
    expect(parseWorkOrderLockInput({ title: "Ny rubrik" })).toEqual({ ok: false, code: "lock_required" });
    expect(parseWorkOrderLockInput({ editToken: "token" })).toEqual({ ok: false, code: "lock_required" });
    expect(parseWorkOrderLockInput({ version: "2026-09-01T09:00:00.000Z" })).toEqual({ ok: false, code: "lock_required" });
  });

  it("rejects a non-date version before any write", () => {
    expect(parseWorkOrderLockInput({ editToken: "token", version: "not-a-date" })).toEqual({
      ok: false,
      code: "invalid_version",
    });
  });

  it("accepts a lock token with a parseable version", () => {
    const parsed = parseWorkOrderLockInput({
      editToken: "token",
      version: "2026-09-01T09:00:00.000Z",
      title: "Ny rubrik",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.editToken).toBe("token");
      expect(parsed.expectedUpdatedAt.toISOString()).toBe("2026-09-01T09:00:00.000Z");
    }
  });

  it("keeps lock and version conflicts distinguishable", () => {
    expect(new WorkOrderLockError("lock_lost").code).toBe("lock_lost");
    expect(new WorkOrderLockError("version_conflict").code).toBe("version_conflict");
  });
});
