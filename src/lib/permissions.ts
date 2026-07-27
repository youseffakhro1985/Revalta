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

/** Technicians (and residents) only see work assigned to themselves. */
export function shouldScopeToAssignedWork(role: string) {
  return hasRole(role, ["technician", "resident"]);
}

/** Managers and admins distribute work; technicians execute assigned work. */
export function canAssignWorkOrders(role: string) {
  return hasRole(role, ["owner", "admin", "manager"]);
}

/** Viewer/resident are read-only in the manager workspace. */
export function canWriteOperations(role: string) {
  return canManageTickets(role);
}
