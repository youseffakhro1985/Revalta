import { cookies } from "next/headers";
import db from "@/lib/db";
import { verifyToken } from "@/lib/session";
import { LEGACY_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/session-policy";

export {
  canCreateProperties,
  canExportTickets,
  canManageBilling,
  canManageCompany,
  canManageIntegrations,
  canManageLeases,
  canManageTeam,
  canManageTickets,
  canViewAudit,
  canViewOperations,
} from "@/lib/permissions";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || cookieStore.get(LEGACY_SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true, email: true, name: true, role: true, status: true, company_id: true,
      email_verified_at: true, created_at: true,
      company: { select: { id: true, name: true, plan: true, status: true } },
    },
  });

  if (!user || user.email !== session.email || user.status !== "active" || (user.company && user.company.status !== "active")) return null;
  return user;
}

export function tenantWhere(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return user.company_id ? { company_id: user.company_id } : { user_id: user.id };
}
