import { describe, expect, it } from "vitest";
import {
  canAccessResidentPortal,
  canCreateResidentPortalTicket,
  canDownloadResidentDocuments,
  canExportTickets,
  canManageAccessCredentials,
  canManageResidentPortal,
  canManageTeam,
  canManageTickets,
  canViewAudit,
  canViewOperations,
  isResident,
  isStaffRole,
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

  it("identifierar resident-rollen", () => {
    expect(isResident("resident")).toBe(true);
    expect(isResident("viewer")).toBe(false);
  });

  it.each(["owner", "admin", "manager", "technician", "viewer"])("identifierar %s som personalroll", (role) => {
    expect(isStaffRole(role)).toBe(true);
    expect(isResident(role)).toBe(false);
  });

  it("nekar resident som personalroll", () => {
    expect(isStaffRole("resident")).toBe(false);
  });

  it.each(["owner", "admin", "manager", "technician", "viewer", "resident"])("låter %s öppna boendeportalen", (role) => {
    expect(canAccessResidentPortal(role)).toBe(true);
  });

  it("nekar okänd roll till boendeportalen", () => {
    expect(canAccessResidentPortal("unknown")).toBe(false);
  });

  it.each(["owner", "admin", "manager", "technician", "resident"])("låter %s skapa boendeärenden", (role) => {
    expect(canCreateResidentPortalTicket(role)).toBe(true);
  });

  it.each(["viewer", "unknown", ""])("nekar %s att skapa boendeärenden", (role) => {
    expect(canCreateResidentPortalTicket(role)).toBe(false);
    expect(canManageResidentPortal(role)).toBe(false);
  });

  it.each(["owner", "admin", "manager", "resident"])("låter %s ladda ner boendedokument", (role) => {
    expect(canDownloadResidentDocuments(role)).toBe(true);
  });

  it.each(["technician", "viewer", "unknown", ""])("nekar %s nedladdning av boendedokument", (role) => {
    expect(canDownloadResidentDocuments(role)).toBe(false);
  });
});
