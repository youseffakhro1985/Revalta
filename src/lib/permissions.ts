import { UserRole } from "@prisma/client";

export const permissions = {
  canAccessAdmin: [UserRole.super_owner, UserRole.internal_admin],
  canApproveRegistration: [UserRole.super_owner, UserRole.internal_admin],
  canViewAllCompanies: [UserRole.super_owner, UserRole.internal_admin],
  canBlockCompany: [UserRole.super_owner],
  canDeleteCompany: [UserRole.super_owner],
  canManageOwnCompany: [
    UserRole.company_owner,
    UserRole.company_admin,
  ],
  canManageTickets: [
    UserRole.company_owner,
    UserRole.company_admin,
    UserRole.property_manager,
    UserRole.operations_user,
  ],
  canManageDocuments: [
    UserRole.company_owner,
    UserRole.company_admin,
    UserRole.property_manager,
  ],
} as const;

export function hasPermission(
  role: UserRole,
  permission: keyof typeof permissions
) {
  return permissions[permission].includes(role);
}
