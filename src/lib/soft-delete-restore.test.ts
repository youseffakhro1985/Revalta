import { describe, expect, it } from "vitest";
import {
  isProjectStatus,
  readAuditPreviousStatus,
  resolveRestoredProjectStatus,
} from "@/lib/soft-delete-restore";

describe("soft-delete restore helpers", () => {
  it("validates project statuses", () => {
    expect(isProjectStatus("active")).toBe(true);
    expect(isProjectStatus("unknown")).toBe(false);
  });

  it("restores previousStatus when delete forced cancelled", () => {
    expect(resolveRestoredProjectStatus("cancelled", "active")).toBe("active");
    expect(resolveRestoredProjectStatus("cancelled", "planned")).toBe("planned");
  });

  it("keeps completed status", () => {
    expect(resolveRestoredProjectStatus("completed", "active")).toBe("active");
    expect(resolveRestoredProjectStatus("completed", undefined)).toBe("completed");
  });

  it("falls back when previousStatus missing", () => {
    expect(resolveRestoredProjectStatus("cancelled", undefined)).toBe("planned");
    expect(resolveRestoredProjectStatus("paused", undefined)).toBe("paused");
  });

  it("reads previousStatus from audit metadata", () => {
    expect(readAuditPreviousStatus({ previousStatus: "active", softDelete: true })).toBe("active");
    expect(readAuditPreviousStatus(null)).toBeUndefined();
  });
});
