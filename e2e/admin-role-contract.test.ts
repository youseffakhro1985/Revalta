import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateAdminAssignQueueReadable,
  validateAdminAuditReadable,
  validateAdminCreated,
  validateAdminForbidden,
  validateAdminForceRelease,
  validateAdminInvoiceManageable,
  validateAdminLockAcquired,
  validateAdminLockBoardForceRelease,
  validateAdminOperationsReadable,
  validateAdminProfile,
  validateAdminPropertyCreateAllowed,
  validateAdminWorkOrderWritable,
} from "./admin-role-contract.mjs";
import { REQUIRED_STEPS } from "./preview-runner.mjs";

describe("admin-role contract", () => {
  it("accepts an owner-created admin with audit and force-release", () => {
    expect(validateAdminCreated(201, { member: { id: "adm-1", role: "admin" } })).toBe("adm-1");
    validateAdminProfile(200, {
      user: { role: "admin", status: "active", company_id: "co-1", company: { id: "co-1" } },
    }, "co-1");
    validateAdminPropertyCreateAllowed(200, { permissions: { canCreate: true } });
    validateAdminForbidden(403, { errorCode: "FORBIDDEN" }, "Grant owner role");
    validateAdminAuditReadable(200, { auditLogs: [] });
    validateAdminOperationsReadable(200, { schedules: [], health: { activeSchedules: 0 } });
    validateAdminAssignQueueReadable(200, { workOrders: [], assignees: [] });
    validateAdminWorkOrderWritable(200, {
      workOrder: { id: "wo-1" },
      canManage: true,
      canAssign: true,
      canViewFinance: true,
      canManageFinance: true,
    }, "wo-1");
    validateAdminInvoiceManageable(200, { canManage: true });
    validateAdminLockBoardForceRelease(200, { canForceRelease: true, locks: [] });
    validateAdminForceRelease(404);
    expect(validateAdminLockAcquired(201, { lock: { token: "tok" } })).toBe("tok");
  });

  it("rejects manager-shaped access without payloads", () => {
    expect(() => validateAdminCreated(403, { errorCode: "FORBIDDEN" })).toThrow(/was not created \(403:FORBIDDEN\)/);
    expect(() => validateAdminProfile(200, {
      user: { role: "manager", status: "active", company_id: "co-1", company: { id: "co-1" } },
    }, "co-1")).toThrow(/scoped staff fixture/);
    expect(() => validateAdminAuditReadable(403, { errorCode: "FORBIDDEN" })).toThrow(
      /audit log was not readable \(403:FORBIDDEN\)/,
    );
    expect(() => validateAdminLockBoardForceRelease(200, { canForceRelease: false, locks: [] })).toThrow(
      /did not allow force-release \(200:none\)/,
    );
    expect(() => validateAdminForceRelease(403, { errorCode: "FORBIDDEN" })).toThrow(
      /leftover work-order edit lock \(403:FORBIDDEN\)/,
    );
  });
});

describe("admin role is wired into the required Preview browser job", () => {
  it("requires the admin-role Preview step", () => {
    expect(REQUIRED_STEPS).toContain("admin-role-preview");
  });

  it("runs inside auth-navigation without a workflow YAML change", () => {
    const runner = readFileSync(new URL("./auth-navigation.mjs", import.meta.url), "utf8");
    const workflow = readFileSync(new URL("../.github/workflows/e2e-preview.yml", import.meta.url), "utf8");
    const source = readFileSync(new URL("./admin-role.mjs", import.meta.url), "utf8");
    const contract = readFileSync(new URL("./admin-role-contract.mjs", import.meta.url), "utf8");
    expect(runner).toContain("runAdminRolePreview");
    expect(runner).toContain('complete("admin-role-preview")');
    expect(workflow).toContain("node e2e/auth-navigation.mjs");
    expect(source).toContain('role: "admin"');
    expect(source).toContain('role: "owner"');
    expect(source).toContain("/api/audit");
    expect(source).toContain("/api/work-orders/edit-locks");
    expect(contract).toContain("canForceRelease");
    expect(source).toContain("DELETE");
    expect(source).toContain("#ekonomi");
    expect(source).toContain('goto("/dashboard"');
    expect(source).not.toContain("page.route");
  });
});
