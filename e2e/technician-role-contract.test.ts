import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateAssignedWorkOrderVisible,
  validateTechnicianCalendarAssigned,
  validateTechnicianCalendarHidden,
  validateTechnicianCreated,
  validateTechnicianForbidden,
  validateTechnicianProfile,
  validateUnassignedWorkOrderHidden,
} from "./technician-role-contract.mjs";
import { REQUIRED_STEPS } from "./preview-runner.mjs";

describe("technician-role contract", () => {
  it("accepts an owner-created technician and assigned-work visibility", () => {
    expect(validateTechnicianCreated(201, { member: { id: "tech-1", role: "technician" } })).toBe("tech-1");
    validateTechnicianProfile(200, {
      user: { role: "technician", status: "active", company_id: "co-1", company: { id: "co-1" } },
    }, "co-1");
    validateTechnicianForbidden(403, { errorCode: "FORBIDDEN" }, "Document library");
    validateUnassignedWorkOrderHidden(404, {});
    validateAssignedWorkOrderVisible(200, { workOrder: { id: "wo-1" } }, "wo-1");
    validateTechnicianCalendarHidden(200, { events: [{ source: "work_order", work_order_id: "other" }] }, "wo-1");
    validateTechnicianCalendarAssigned(200, {
      events: [{ source: "work_order", work_order_id: "wo-1" }],
    }, "wo-1");
  });

  it("rejects owner-shaped profiles and leaked unassigned work without payloads", () => {
    expect(() => validateTechnicianCreated(403, { errorCode: "FORBIDDEN" })).toThrow(
      /was not created \(403:FORBIDDEN\)/,
    );
    expect(() => validateTechnicianProfile(200, {
      user: { role: "owner", status: "active", company_id: "co-1", company: { id: "co-1" } },
    }, "co-1")).toThrow(/scoped staff fixture/);
    expect(() => validateTechnicianForbidden(200, { workOrder: { id: "wo-1" } }, "Invoice basis")).toThrow(
      /Invoice basis was not forbidden \(200:none\)/,
    );
    expect(() => validateUnassignedWorkOrderHidden(200, { workOrder: { id: "wo-1" } })).toThrow(
      /visible to technician \(200:none\)/,
    );
    expect(() => validateTechnicianCalendarHidden(200, {
      events: [{ source: "lease", entity_id: "lease-1" }],
    }, "wo-1")).toThrow(/was not scoped away from unassigned work or leases/);
    expect(() => validateTechnicianCalendarAssigned(200, {
      events: [{ source: "work_order", work_order_id: "other" }],
    }, "wo-1")).toThrow(/did not project the assigned work order/);
  });
});

describe("technician role is wired into the required Preview browser job", () => {
  it("requires the technician-role Preview step", () => {
    expect(REQUIRED_STEPS).toContain("technician-role-preview");
  });

  it("runs inside auth-navigation without a workflow YAML change", () => {
    const runner = readFileSync(new URL("./auth-navigation.mjs", import.meta.url), "utf8");
    const workflow = readFileSync(new URL("../.github/workflows/e2e-preview.yml", import.meta.url), "utf8");
    const source = readFileSync(new URL("./technician-role.mjs", import.meta.url), "utf8");
    expect(runner).toContain("runTechnicianRolePreview");
    expect(runner).toContain('complete("technician-role-preview")');
    expect(workflow).toContain("node e2e/auth-navigation.mjs");
    expect(source).toContain("/api/team");
    expect(source).toContain("/api/documents/library");
    expect(source).toContain("assignedToId");
    expect(source).toContain("/api/calendar");
    expect(source).toContain("scheduledStart");
    expect(source).not.toContain("page.route");
  });
});
