import { describe, expect, it } from "vitest";
import {
  isAssignedWorkAccessible,
  redactTicketReporterPii,
} from "@/lib/assigned-work-access";

describe("assigned-work-access", () => {
  it("låter chefer se alla tilldelningar", () => {
    expect(isAssignedWorkAccessible({ id: "u1", role: "manager" }, "other")).toBe(true);
    expect(isAssignedWorkAccessible({ id: "u1", role: "viewer" }, null)).toBe(true);
  });

  it("låser tekniker till egen tilldelning", () => {
    expect(isAssignedWorkAccessible({ id: "tech-1", role: "technician" }, "tech-1")).toBe(true);
    expect(isAssignedWorkAccessible({ id: "tech-1", role: "technician" }, "other")).toBe(false);
    expect(isAssignedWorkAccessible({ id: "tech-1", role: "technician" }, null)).toBe(false);
  });

  it("redakterar reporter-PII för tekniker", () => {
    const ticket = {
      reporter_name: "Anna",
      reporter_email: "anna@exempel.se",
      reporter_phone: "070",
      reporter_unit: "1201",
    };
    expect(redactTicketReporterPii({ role: "technician" }, ticket)).toEqual({
      reporter_name: null,
      reporter_email: null,
      reporter_phone: null,
      reporter_unit: null,
    });
    expect(redactTicketReporterPii({ role: "manager" }, ticket)).toEqual(ticket);
  });
});
