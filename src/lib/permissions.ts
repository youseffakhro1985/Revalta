import type { UserRole } from "@prisma/client";

const adminRoles: UserRole[] = ["super_owner", "internal_admin"];
const companyManagerRoles: UserRole[] = ["company_owner", "company_admin", "property_manager"];
const operationalRoles: UserRole[] = [...companyManagerRoles, "operations_user"];

export function isPlatformAdmin(role?: UserRole | string | null) {
  return Boolean(role && adminRoles.includes(role as UserRole));
}

export function canManageTickets(role?: UserRole | string | null) {
  return Boolean(role && operationalRoles.includes(role as UserRole));
}

export function canManageDocuments(role?: UserRole | string | null) {
  return Boolean(role && companyManagerRoles.includes(role as UserRole));
}

export function canManageOwnCompany(role?: UserRole | string | null) {
  return Boolean(role && companyManagerRoles.includes(role as UserRole));
}

export function canViewCompanyData(role?: UserRole | string | null) {
  return Boolean(role);
}

