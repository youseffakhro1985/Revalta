import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateManagerAssignQueueReadable,
  validateManagerCreated,
  validateManagerForbidden,
  validateManagerInvoiceManageable,
  validateManagerLockAcquired,
  validateManagerOperationsReadable,
  validateManagerProfile,
  validateManagerPropertyCreateAllowed,
  validateManagerWorkOrderWritable,
} from "./manager-role-contract.mjs";
import { REQUIRED_STEPS } from "./preview-runner.mjs";

describe("manager-role contract", () => {
  it("accepts an owner-created manager with operations and finance write", () => {
    expect(validateManagerCreated(201, { member: { id: "mgr-1", role: "manager" } })).toBe("mgr-1");
    validateManagerProfile(200, {
      user: { role: "manager", status: "active", company_id: "co-1", company: { id: "co-1" } },
    }, "co-1");
    validateManagerPropertyCreateAllowed(200, { permissions: { canCreate: true } });
    validateManagerForbidden(403, { errorCode: "FORBIDDEN" }, "Audit log");
    validateManagerOperationsReadable(200, { schedules: [], health: { activeSchedules: 0 } });
    validateManagerAssignQueueReadable(200, { workOrders: [], assignees: [] });
    validateManagerWorkOrderWritable(200, {
      workOrder: { id: "wo-1" },
      canManage: true,
      canAssign: true,
      canViewFinance: true,
      canManageFinance: true,
    }, "wo-1");
    validateManagerInvoiceManageable(200, { canManage: true });
    expect(validateManagerLockAcquired(201, { lock: { token: "tok" } })).toBe("tok");
  });

  it("rejects viewer-shaped access and missing operations payloads", () => {
    expect(() => validateManagerCreated(403, { errorCode: "FORBIDDEN" })).toThrow(/was not created \(403:FORBIDDEN\)/);
    expect(() => validateManagerProfile(200, {
      user: { role: "viewer", status: "active", company_id: "co-1", company: { id: "co-1" } },
    }, "co-1")).toThrow(/scoped staff fixture/);
    expect(() => validateManagerPropertyCreateAllowed(200, { permissions: { canCreate: false } })).toThrow(
      /property create capability was not granted \(200:none\)/,
    );
    expect(() => validateManagerOperationsReadable(403, { errorCode: "FORBIDDEN" })).toThrow(
      /operations overview was not readable \(403:FORBIDDEN\)/,
    );
    expect(() => validateManagerWorkOrderWritable(200, {
      workOrder: { id: "wo-1" },
      canManage: false,
      canAssign: true,
      canViewFinance: true,
      canManageFinance: true,
    }, "wo-1")).toThrow(/writable work-order and finance access/);
    expect(() => validateManagerInvoiceManageable(200, { canManage: false })).toThrow(
      /invoice basis was not manageable \(200:none\)/,
    );
  });
});

describe("manager role is wired into the required Preview browser job", () => {
  it("requires the manager-role Preview step", () => {
    expect(REQUIRED_STEPS).toContain("manager-role-preview");
  });

  it("runs inside auth-navigation without a workflow YAML change", () => {
    const runner = readFileSync(new URL("./auth-navigation.mjs", import.meta.url), "utf8");
    const workflow = readFileSync(new URL("../.github/workflows/e2e-preview.yml", import.meta.url), "utf8");
    const source = readFileSync(new URL("./manager-role.mjs", import.meta.url), "utf8");
    expect(runner).toContain("runManagerRolePreview");
    expect(runner).toContain('complete("manager-role-preview")');
    expect(workflow).toContain("node e2e/auth-navigation.mjs");
    expect(source).toContain('role: "manager"');
    expect(source).toContain("/api/settings/profile");
    expect(source).toContain("/api/work-orders/recurring");
    expect(source).toContain("/api/work-orders/unassigned-queue");
    expect(source).toContain("/api/audit");
    expect(source).toContain('POST", "/api/team"');
    expect(source).toContain("edit-lock");
    expect(source).toContain("/invoice-basis");
    expect(source).toContain("#work-order-title");
    expect(source).toContain("#ekonomi");
    expect(source).toContain("Spara låst och validerad ändring");
    expect(source).toContain("Väntar på redigeringslås");
    expect(source).toContain('goto("/dashboard"');
    expect(source).toContain("width: 390");
    expect(source).not.toContain("page.route");
  });
});
