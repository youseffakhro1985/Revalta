import { getSession, SessionPayload } from "@/lib/session";
import { permissions, hasPermission } from "@/lib/permissions";
import { UserRole } from "@prisma/client";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * 1. Grundläggande guard.
 * Blocked/deleted access checks körs alltid här på backend-nivå för extra säkerhet,
 * ifall Middleware skulle bli förbikopplad eller om statusen ändrats under sessionens gång.
 */
export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new AuthError("Obehörig åtkomst. Vänligen logga in.");
  }

  if (session.status === "blocked" || session.status === "deleted") {
    throw new AuthError("Ditt konto är spärrat eller borttaget.");
  }
  if (session.companyStatus === "blocked" || session.companyStatus === "deleted") {
    throw new AuthError("Ditt anslutna företag är spärrat från plattformen.");
  }

  return session;
}

/**
 * 2. Admin Guard
 * Endast för systemadministratörer.
 */
export async function requireAdminGuard(): Promise<SessionPayload> {
  const session = await requireAuth();
  
  if (session.role !== "super_owner" && session.role !== "internal_admin") {
    throw new AuthError("Åtkomst nekad. Endast systemadministratörer har tillgång.");
  }
  return session;
}

/**
 * 3. Dashboard Guard & Company Scope Helper
 * Säkerställer åtkomst till företagets data (Tenant isolation).
 */
export async function requireCompanyScope(): Promise<{ session: SessionPayload; companyId: string }> {
  const session = await requireAuth();

  if (!session.companyId) {
    throw new AuthError("Kräver ett aktivt företagsmedlemskap för att utföra denna åtgärd.");
  }

  return { session, companyId: session.companyId };
}

/**
 * 4. Server-side Permission Helper
 * Validerar specifika RBAC-rättigheter för Server Actions / API routes.
 */
export async function requirePermission(permission: keyof typeof permissions): Promise<SessionPayload> {
  const session = await requireAuth();
  
  const role = session.role as UserRole;
  if (!hasPermission(role, permission)) {
    throw new AuthError(`Åtkomst nekad. Du saknar rättigheten: ${permission}`);
  }

  return session;
}
