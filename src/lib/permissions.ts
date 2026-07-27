export const USER_ROLES = ["owner", "admin", "manager", "technician", "viewer", "resident"] as const;

export type UserRole = (typeof USER_ROLES)[number];

function hasRole(role: string, allowed: readonly UserRole[]) {
  return allowed.includes(role as UserRole);
}

export function canManageTeam(role: string) {
  return hasRole(role, ["owner", "admin"]);
}

export function canManageTickets(role: string) {
  return hasRole(role, ["owner", "admin", "manager", "technician"]);
}

export function canManageLeases(role: string) {
  return hasRole(role, ["owner", "admin", "manager"]);
}

export function canCreateProperties(role: string) {
  return hasRole(role, ["owner", "admin", "manager"]);
}

export function canViewAudit(role: string) {
  return hasRole(role, ["owner", "admin"]);
}

export function canManageCompany(role: string) {
  return hasRole(role, ["owner", "admin"]);
}

export function canManageBilling(role: string) {
  return hasRole(role, ["owner", "admin"]);
}

export function canManageIntegrations(role: string) {
  return hasRole(role, ["owner", "admin"]);
}

export function canManageAccessCredentials(role: string) {
  return hasRole(role, ["owner", "admin", "manager"]);
}

export function canExportTickets(role: string) {
  return hasRole(role, ["owner", "admin", "manager"]);
}

export function canViewOperations(role: string) {
  return hasRole(role, ["owner", "admin", "manager"]);
}

export function isResident(role: string) {
  return role === "resident";
}

/** Internal company workspace roles (not resident self-service). */
export function isStaffRole(role: string) {
  return hasRole(role, ["owner", "admin", "manager", "technician", "viewer"]);
}

/** Authenticated portal access for staff workspace and resident self-service. */
export function canAccessResidentPortal(role: string) {
  return isResident(role) || isStaffRole(role);
}

/** Staff may create tickets on behalf of any active lease. */
export function canManageResidentPortal(role: string) {
  return canManageTickets(role);
}

/** Residents create tickets for their own matched leases; staff keep current rights. */
export function canCreateResidentPortalTicket(role: string) {
  return canManageResidentPortal(role) || isResident(role);
}

/** Document download for ops staff or resident self-service. */
export function canDownloadResidentDocuments(role: string) {
  return canViewOperations(role) || isResident(role);
}
