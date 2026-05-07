import db from "@/lib/db";
import { Prisma } from "@prisma/client";

type AuditUser = {
  id: string;
  company_id: string | null;
};

export async function writeAuditLog(
  user: AuditUser,
  input: {
    entityType: string;
    entityId?: string | null;
    action: string;
    metadata?: Record<string, unknown>;
  }
) {
  await db.auditLog.create({
    data: {
      company_id: user.company_id,
      actor_user_id: user.id,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
