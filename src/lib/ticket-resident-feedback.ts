export const TICKET_RESIDENT_FEEDBACK_ACTION = "ticket.resident_feedback";

export type TicketResidentFeedback = {
  rating: number;
  comment: string | null;
  submittedAt: string;
};

type AuditLookup = {
  auditLog: {
    findFirst: (args: {
      where: {
        company_id: string;
        entity_type: string;
        entity_id: string;
        action: string;
      };
      orderBy: { created_at: "desc" };
      select: { metadata: true; created_at: true };
    }) => Promise<{ metadata: unknown; created_at: Date } | null>;
  };
};

export function parseResidentFeedbackMetadata(
  metadata: unknown,
  submittedAt: Date | string,
): TicketResidentFeedback | null {
  if (!metadata || typeof metadata !== "object") return null;
  const rating = Number((metadata as { rating?: unknown }).rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  const commentRaw = (metadata as { comment?: unknown }).comment;
  const comment =
    typeof commentRaw === "string" && commentRaw.trim()
      ? commentRaw.trim().slice(0, 1000)
      : null;
  return {
    rating,
    comment,
    submittedAt: typeof submittedAt === "string" ? submittedAt : submittedAt.toISOString(),
  };
}

export async function loadTicketResidentFeedback(
  db: AuditLookup,
  input: { companyId: string; ticketId: string },
): Promise<TicketResidentFeedback | null> {
  const row = await db.auditLog.findFirst({
    where: {
      company_id: input.companyId,
      entity_type: "ticket",
      entity_id: input.ticketId,
      action: TICKET_RESIDENT_FEEDBACK_ACTION,
    },
    orderBy: { created_at: "desc" },
    select: { metadata: true, created_at: true },
  });
  if (!row) return null;
  return parseResidentFeedbackMetadata(row.metadata, row.created_at);
}
