import { cookies } from "next/headers";
import db from "@/lib/db";
import { verifyToken } from "@/lib/session";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session) return null;

  return db.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      company_id: true,
      email_verified_at: true,
      created_at: true,
      company: {
        select: {
          id: true,
          name: true,
          plan: true,
          status: true,
        },
      },
    },
  });
}

export function tenantWhere(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return user.company_id ? { company_id: user.company_id } : { user_id: user.id };
}

export function canManageTeam(role: string) {
  return role === "owner" || role === "admin";
}

export function canManageTickets(role: string) {
  return role === "owner" || role === "admin" || role === "manager" || role === "technician";
}

export function canCreateProperties(role: string) {
  return role === "owner" || role === "admin" || role === "manager";
}

export function canViewAudit(role: string) {
  return role === "owner" || role === "admin";
}

export function canManageCompany(role: string) {
  return role === "owner" || role === "admin";
}

export function canManageBilling(role: string) {
  return role === "owner" || role === "admin";
}

export function canManageIntegrations(role: string) {
  return role === "owner" || role === "admin";
}

export function canExportTickets(role: string) {
  return role === "owner" || role === "admin" || role === "manager";
}

export function canViewOperations(role: string) {
  return role === "owner" || role === "admin" || role === "manager";
}
