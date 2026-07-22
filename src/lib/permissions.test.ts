import { describe, expect, it } from "vitest";
import {
  canExportTickets,
  canManageTeam,
  canManageTickets,
  canViewAudit,
  canViewOperations,
  USER_ROLES,
} from "@/lib/permissions";

describe("permissions", () => {
  it("har en explicit och stabil rollista", () => {
    expect(USER_ROLES).toEqual(["owner", "admin", "manager", "technician", "resident"]);
  });

  it.each(["owner", "admin"])("låter %s administrera team och granska audit", (role) => {
    expect(canManageTeam(role)).toBe(true);
    expect(canViewAudit(role)).toBe(true);
  });

  it.each(["manager", "technician", "resident", "unknown"])("nekar %s administrativ åtkomst", (role) => {
    expect(canManageTeam(role)).toBe(false);
    expect(canViewAudit(role)).toBe(false);
  });

  it.each(["owner", "admin", "manager"])("låter %s se operativa rapporter och exportera ärenden", (role) => {
    expect(canViewOperations(role)).toBe(true);
    expect(canExportTickets(role)).toBe(true);
  });

  it.each(["technician", "resident", "unknown", ""])("nekar %s operativa ledningsrapporter", (role) => {
    expect(canViewOperations(role)).toBe(false);
    expect(canExportTickets(role)).toBe(false);
  });

  it.each(["owner", "admin", "manager", "technician"])("låter %s arbeta med ärenden", (role) => {
    expect(canManageTickets(role)).toBe(true);
  });

  it.each(["resident", "unknown", ""])("nekar %s att administrera ärenden", (role) => {
    expect(canManageTickets(role)).toBe(false);
  });
});
