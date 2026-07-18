import db from "@/lib/db";

export type DocumentLifecycleState = "active" | "unpublished" | "archived";

const lifecycleActions = [
  "document.unpublished",
  "document.archived",
  "document.restored",
] as const;

export function lifecycleStateFromAction(action: string | null | undefined): DocumentLifecycleState {
  if (action === "document.unpublished") return "unpublished";
  if (action === "document.archived") return "archived";
  return "active";
}

export async function getDocumentLifecycleState(companyId: string, documentId: string) {
  const event = await db.auditLog.findFirst({
    where: {
      company_id: companyId,
      entity_type: "document",
      entity_id: documentId,
      action: { in: [...lifecycleActions] },
    },
    orderBy: { created_at: "desc" },
    select: { action: true, created_at: true },
  });

  return {
    state: lifecycleStateFromAction(event?.action),
    changedAt: event?.created_at || null,
  };
}

export async function getDocumentLifecycleMap(companyId: string, documentIds: string[]) {
  if (documentIds.length === 0) return new Map<string, { state: DocumentLifecycleState; changedAt: Date | null }>();

  const events = await db.auditLog.findMany({
    where: {
      company_id: companyId,
      entity_type: "document",
      entity_id: { in: documentIds },
      action: { in: [...lifecycleActions] },
    },
    orderBy: { created_at: "desc" },
    select: { entity_id: true, action: true, created_at: true },
  });

  const result = new Map<string, { state: DocumentLifecycleState; changedAt: Date | null }>();
  for (const event of events) {
    if (!event.entity_id || result.has(event.entity_id)) continue;
    result.set(event.entity_id, {
      state: lifecycleStateFromAction(event.action),
      changedAt: event.created_at,
    });
  }

  for (const documentId of documentIds) {
    if (!result.has(documentId)) result.set(documentId, { state: "active", changedAt: null });
  }
  return result;
}
