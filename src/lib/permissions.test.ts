import { describe, expect, it } from "vitest";
import {
  canAssignWorkOrders,
  canExportTickets,
  canManageAccessCredentials,
  canManageTeam,
  canManageTickets,
  canViewAudit,
  canViewOperations,
  shouldScopeToAssignedWork,
  USER_ROLES,
} from "@/lib/permissions";

describe("permissions", () => {
  it("har en explicit och stabil rollista", () => {
    expect(USER_ROLES).toEqual(["owner", "admin", "manager", "technician", "viewer", "resident"]);
  });

  it.each(["owner", "admin"])("låter %s administrera team och granska audit", (role) => {
    expect(canManageTeam(role)).toBe(true);
    expect(canViewAudit(role)).toBe(true);
  });

  it.each(["manager", "technician", "viewer", "resident", "unknown"])("nekar %s administrativ åtkomst", (role) => {
    expect(canManageTeam(role)).toBe(false);
    expect(canViewAudit(role)).toBe(false);
  });

  it.each(["owner", "admin", "manager"])("låter %s se operativa rapporter och exportera ärenden", (role) => {
    expect(canViewOperations(role)).toBe(true);
    expect(canExportTickets(role)).toBe(true);
  });

  it.each(["technician", "viewer", "resident", "unknown", ""])("nekar %s operativa ledningsrapporter", (role) => {
    expect(canViewOperations(role)).toBe(false);
    expect(canExportTickets(role)).toBe(false);
  });

  it.each(["owner", "admin", "manager", "technician"])("låter %s arbeta med ärenden", (role) => {
    expect(canManageTickets(role)).toBe(true);
  });

  it.each(["viewer", "resident", "unknown", ""])("nekar %s att administrera ärenden", (role) => {
    expect(canManageTickets(role)).toBe(false);
  });

  it.each(["owner", "admin", "manager"])("låter %s hantera nycklar och passage", (role) => {
    expect(canManageAccessCredentials(role)).toBe(true);
  });

  it.each(["technician", "viewer", "resident", "unknown", ""])("nekar %s hantering av nycklar och passage", (role) => {
    expect(canManageAccessCredentials(role)).toBe(false);
  });

  it.each(["technician", "resident"])("scopesar %s till tilldelat arbete", (role) => {
    expect(shouldScopeToAssignedWork(role)).toBe(true);
  });

  it.each(["owner", "admin", "manager", "viewer"])("scopesar inte %s till endast tilldelat arbete", (role) => {
    expect(shouldScopeToAssignedWork(role)).toBe(false);
  });

  it.each(["owner", "admin", "manager"])("låter %s tilldela arbetsordrar", (role) => {
    expect(canAssignWorkOrders(role)).toBe(true);
  });

  it.each(["technician", "viewer", "resident", "unknown", ""])("nekar %s att tilldela arbetsordrar", (role) => {
    expect(canAssignWorkOrders(role)).toBe(false);
  });
});
