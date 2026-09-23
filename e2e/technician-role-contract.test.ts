import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateAssignedWorkOrderVisible,
  validateTechnicianCalendarAssigned,
  validateTechnicianCalendarHidden,
  validateTechnicianCompanyReadOnly,
  validateTechnicianCreated,
  validateTechnicianForbidden,
  validateTechnicianOnboardingIneligible,
  validateTechnicianProfile,
  validateTechnicianPropertyCreateDenied,
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
    validateTechnicianPropertyCreateDenied(200, { permissions: { canCreate: false } });
    validateUnassignedWorkOrderHidden(404, {});
    validateAssignedWorkOrderVisible(200, { workOrder: { id: "wo-1" } }, "wo-1");
    validateTechnicianCalendarHidden(200, { events: [{ source: "work_order", work_order_id: "other" }] }, "wo-1");
    validateTechnicianCalendarAssigned(200, {
      events: [{ source: "work_order", work_order_id: "wo-1" }],
    }, "wo-1");
    validateTechnicianCompanyReadOnly(200, { canManage: false, company: { id: "co-1" } }, "co-1");
    validateTechnicianOnboardingIneligible(200, { eligible: false, progress: null });
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
    expect(() => validateTechnicianPropertyCreateDenied(200, { permissions: { canCreate: true } })).toThrow(
      /property create capability was not denied \(200:none\)/,
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
    expect(() => validateTechnicianCompanyReadOnly(200, { canManage: true, company: { id: "co-1" } }, "co-1")).toThrow(
      /company settings were not read-only \(200:none\)/,
    );
    expect(() => validateTechnicianOnboardingIneligible(200, { eligible: true, progress: {} })).toThrow(
      /onboarding was not returned as ineligible \(200:none\)/,
    );
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
    expect(runner).toContain("propertyId: golden.propertyId");
    expect(runner).toContain('complete("technician-role-preview")');
    expect(workflow).toContain("node e2e/auth-navigation.mjs");
    expect(source).toContain("/api/team");
    expect(source).toContain("/api/documents/library");
    expect(source).toContain("/api/work-orders/recurring");
    expect(source).toContain("/api/maintenance/preventive");
    expect(source).toContain("/api/maintenance/portfolio");
    expect(source).toContain("maintenance-plan/export");
    expect(source).toContain("validateTechnicianPropertyCreateDenied");
    expect(source).toContain('POST", "/api/properties"');
    expect(source).toContain('POST", "/api/team"');
    expect(source).toContain("/api/audit");
    expect(source).toContain("/api/settings/company");
    expect(source).toContain("/api/billing");
    expect(source).toContain("/api/integrations");
    expect(source).toContain("/api/onboarding");
    expect(source).toContain("/api/work-orders/unassigned-queue");
    expect(source).toContain("/api/tickets/unassigned-queue");
    expect(source).toContain("assignedToId");
    expect(source).toContain("/api/calendar");
    expect(source).toContain("scheduledStart");
    expect(source).toContain("#work-order-title");
    expect(source).toContain("width: 390");
    expect(source).toContain("getElementById(\"ekonomi\")");
    expect(source).toContain("Registreringsformulären är dolda eftersom utförandet är skrivskyddat.");
    expect(source).toContain("getElementById(\"work-order-execution-material\")");
    expect(source).toContain('goto("/dashboard"');
    expect(source).not.toContain("page.route");
  });
});
