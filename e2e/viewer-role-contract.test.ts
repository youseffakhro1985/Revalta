import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateViewerCompanyReadOnly,
  validateViewerCreated,
  validateViewerForbidden,
  validateViewerInvoiceReadable,
  validateViewerOnboardingIneligible,
  validateViewerProfile,
  validateViewerPropertyCreateDenied,
  validateViewerWorkOrderReadable,
} from "./viewer-role-contract.mjs";
import { REQUIRED_STEPS } from "./preview-runner.mjs";

describe("viewer-role contract", () => {
  it("accepts an owner-created viewer with read-only finance access", () => {
    expect(validateViewerCreated(201, { member: { id: "view-1", role: "viewer" } })).toBe("view-1");
    validateViewerProfile(200, {
      user: { role: "viewer", status: "active", company_id: "co-1", company: { id: "co-1" } },
    }, "co-1");
    validateViewerPropertyCreateDenied(200, { permissions: { canCreate: false } });
    validateViewerForbidden(403, { errorCode: "FORBIDDEN" }, "Audit log");
    validateViewerWorkOrderReadable(200, {
      workOrder: { id: "wo-1" },
      canViewFinance: true,
      canManage: false,
      canManageFinance: false,
    }, "wo-1");
    validateViewerInvoiceReadable(200, { canManage: false });
    validateViewerCompanyReadOnly(200, { canManage: false, company: { id: "co-1" } }, "co-1");
    validateViewerForbidden(403, { errorCode: "FORBIDDEN" }, "Billing plan change");
    validateViewerOnboardingIneligible(200, { eligible: false, progress: null });
  });

  it("rejects owner-shaped profiles and writable finance without payloads", () => {
    expect(() => validateViewerCreated(403, { errorCode: "FORBIDDEN" })).toThrow(/was not created \(403:FORBIDDEN\)/);
    expect(() => validateViewerProfile(200, {
      user: { role: "technician", status: "active", company_id: "co-1", company: { id: "co-1" } },
    }, "co-1")).toThrow(/scoped staff fixture/);
    expect(() => validateViewerPropertyCreateDenied(200, { permissions: { canCreate: true } })).toThrow(
      /property create capability was not denied \(200:none\)/,
    );
    expect(() => validateViewerWorkOrderReadable(200, {
      workOrder: { id: "wo-1" },
      canViewFinance: false,
      canManage: false,
      canManageFinance: false,
    }, "wo-1")).toThrow(/company-wide read-only work-order access/);
    expect(() => validateViewerInvoiceReadable(200, { canManage: true })).toThrow(
      /readable without manage rights \(200:none\)/,
    );
    expect(() => validateViewerCompanyReadOnly(200, { canManage: true, company: { id: "co-1" } }, "co-1")).toThrow(
      /company settings were not read-only \(200:none\)/,
    );
    expect(() => validateViewerOnboardingIneligible(200, { eligible: true, progress: {} })).toThrow(
      /onboarding was not returned as ineligible \(200:none\)/,
    );
  });
});

describe("viewer role is wired into the required Preview browser job", () => {
  it("requires the viewer-role Preview step", () => {
    expect(REQUIRED_STEPS).toContain("viewer-role-preview");
  });

  it("runs inside auth-navigation without a workflow YAML change", () => {
    const runner = readFileSync(new URL("./auth-navigation.mjs", import.meta.url), "utf8");
    const workflow = readFileSync(new URL("../.github/workflows/e2e-preview.yml", import.meta.url), "utf8");
    const source = readFileSync(new URL("./viewer-role.mjs", import.meta.url), "utf8");
    expect(runner).toContain("runViewerRolePreview");
    expect(runner).toContain('complete("viewer-role-preview")');
    expect(workflow).toContain("node e2e/auth-navigation.mjs");
    expect(source).toContain('role: "viewer"');
    expect(source).toContain("/api/settings/profile");
    expect(source).toContain('POST", "/api/properties"');
    expect(source).toContain('POST", "/api/team"');
    expect(source).toContain("/api/audit");
    expect(source).toContain("/api/settings/company");
    expect(source).toContain("/api/billing");
    expect(source).toContain('PATCH", "/api/billing"');
    expect(source).toContain("Billing plan change");
    expect(source).toContain("/api/integrations");
    expect(source).toContain("/api/onboarding");
    expect(source).toContain("/api/work-orders/recurring");
    expect(source).toContain("/api/work-orders/unassigned-queue");
    expect(source).toContain("edit-lock");
    expect(source).toContain("/invoice-basis");
    expect(source).toContain("action: \"rebuild\"");
    expect(source).toContain("#work-order-title");
    expect(source).toContain("#ekonomi");
    expect(source).toContain("Du har läsbehörighet men kan inte ändra arbetsordern.");
    expect(source).toContain("width: 390");
    expect(source).not.toContain("page.route");
  });
});
