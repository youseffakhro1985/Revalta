import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * Centraliserad Audit Log service för att spåra alla kritiska händelser.
 * Garanterar spårbarhet (traceability) enligt Enterprise-standard.
 */
export async function logAudit(
  action: string,
  entityType: string,
  entityId?: string | null,
  oldValues?: Record<string, unknown> | null,
  newValues?: Record<string, unknown> | null
) {
  try {
    const session = await getSession();
    
    await prisma.auditLog.create({
      data: {
        action,
        entityType,
        entityId,
        oldValues: oldValues ? JSON.stringify(oldValues) : null,
        newValues: newValues ? JSON.stringify(newValues) : null,
        actorUserId: session?.userId || null,
        companyId: session?.companyId || null,
      },
    });
  } catch (error) {
    console.error("Critical: Failed to write audit log", error);
    // Vi kastar inte felet vidare. Audit logs får aldrig blockera en lyckad affärstransaktion.
  }
}
