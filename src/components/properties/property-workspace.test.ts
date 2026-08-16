import { describe, expect, it } from "vitest";
import {
  propertyWorkspaceCapabilities,
  propertyWorkspaceSectionsForRole,
} from "@/components/properties/property-workspace";

function ids(role: string) {
  return propertyWorkspaceSectionsForRole(role).map((section) => section.id);
}

describe("property workspace role sections", () => {
  it.each(["owner", "admin", "manager"])("gives %s the complete property binder", (role) => {
    expect(ids(role)).toEqual([
      "oversikt",
      "enheter",
      "drift",
      "teknik",
      "underhall",
      "hyresgaster",
      "dokument",
      "energi",
      "ekonomi",
    ]);
    expect(propertyWorkspaceCapabilities(role).canManagePropertyRecords).toBe(true);
  });

  it("keeps technician focused on operational property data without admin editors", () => {
    expect(ids("technician")).toEqual(["oversikt", "enheter", "drift", "teknik", "dokument"]);
    expect(propertyWorkspaceCapabilities("technician").canViewFinance).toBe(false);
    expect(propertyWorkspaceCapabilities("technician").canViewLeasing).toBe(false);
    expect(propertyWorkspaceCapabilities("technician").canManagePropertyRecords).toBe(false);
  });

  it("keeps viewer read-only on leasing/finance/document areas without operations", () => {
    expect(ids("viewer")).toEqual(["oversikt", "enheter", "hyresgaster", "dokument", "energi", "ekonomi"]);
    expect(propertyWorkspaceCapabilities("viewer").canOperate).toBe(false);
    expect(propertyWorkspaceCapabilities("viewer").canManagePropertyRecords).toBe(false);
  });

  it("does not expose staff property-workspace modules to resident", () => {
    expect(ids("resident")).toEqual(["oversikt", "enheter"]);
  });
});
