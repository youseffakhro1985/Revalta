import db from "@/lib/db";
import {
  createPortalTrackingToken,
  verifyPortalTrackingToken,
} from "@/lib/portal-tracking";
import { checkRateLimit } from "@/lib/rate-limit";
import { loadTicketResidentFeedback } from "@/lib/ticket-resident-feedback";

type PublicCommentAuditMetadata = {
  commentId?: unknown;
  reporterName?: unknown;
  reporterEmail?: unknown;
};

export type PublicTrackedTicket = {
  public_reference: string | null;
  title: string;
  status: string;
  priority: string;
  category: string;
  created_at: string;
  updated_at: string;
  ai_summary: string | null;
  property: { name: string; address: string; city: string } | null;
  residentFeedback: Awaited<ReturnType<typeof loadTicketResidentFeedback>>;
  comments: Array<{
    id: string;
    body: string;
    created_at: string;
    author: { type: "resident" | "management"; name: string };
  }>;
};

export type PublicTrackSuccess = {
  ok: true;
  trackingToken: string;
  ticket: PublicTrackedTicket;
};

export type PublicTrackFailure = {
  ok: false;
  status: 400 | 403 | 404 | 429 | 500;
  error: string;
};

export async function loadPublicTrackedTicket(input: {
  reference: string;
  email?: string | null;
  token?: string | null;
  ip: string;
}): Promise<PublicTrackSuccess | PublicTrackFailure> {
  const rateLimit = await checkRateLimit(`public-track:${input.ip}`, 20, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return { ok: false, status: 429, error: "För många försök. Vänta en stund och prova igen." };
  }

  const reference = input.reference.trim();
  const tracking = verifyPortalTrackingToken(input.token?.trim() || "");
  const authorizedEmail = tracking?.email || input.email?.trim().toLowerCase() || "";

  if (!reference || !authorizedEmail.includes("@")) {
    return { ok: false, status: 400, error: "Referensnummer och e-post eller spårningstoken krävs" };
  }
  if (tracking && tracking.reference !== reference.toUpperCase()) {
    return { ok: false, status: 403, error: "Ogiltig spårningstoken" };
  }

  const ticket = await db.ticket.findFirst({
    where: {
      public_reference: reference.toUpperCase(),
      reporter_email: authorizedEmail,
      deleted_at: null,
      OR: [{ property_id: null }, { property: { deleted_at: null } }],
      ...(tracking ? { company_id: tracking.companyId } : {}),
    },
    select: {
      id: true,
      company_id: true,
      reporter_name: true,
      reporter_email: true,
      public_reference: true,
      title: true,
      status: true,
      priority: true,
      category: true,
      created_at: true,
      updated_at: true,
      ai_summary: true,
      property: { select: { name: true, address: true, city: true } },
      comments: {
        where: { is_internal: false },
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          body: true,
          created_at: true,
          author_type: true,
          author_name: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  if (!ticket?.company_id) {
    return { ok: false, status: 404, error: "Ärendet hittades inte. Kontrollera referensnummer och e-post." };
  }

  const legacyCommentIds = ticket.comments
    .filter((comment) => !comment.author_name)
    .map((comment) => comment.id);

  const externalAuthors = new Map<string, { type: "resident"; name: string }>();
  if (legacyCommentIds.length > 0) {
    const externalAuthorLogs = await db.auditLog.findMany({
      where: {
        company_id: ticket.company_id,
        entity_type: "ticket",
        entity_id: ticket.id,
        action: "public.comment_created",
      },
      orderBy: { created_at: "asc" },
      select: { metadata: true },
    });

    for (const log of externalAuthorLogs) {
      const metadata = (log.metadata || {}) as PublicCommentAuditMetadata;
      if (typeof metadata.commentId !== "string") continue;
      if (!legacyCommentIds.includes(metadata.commentId)) continue;
      const name = typeof metadata.reporterName === "string" && metadata.reporterName.trim()
        ? metadata.reporterName.trim()
        : ticket.reporter_name || "Boende";
      externalAuthors.set(metadata.commentId, { type: "resident", name });
    }
  }

  const trackingToken = createPortalTrackingToken({
    reference: ticket.public_reference || reference.toUpperCase(),
    email: authorizedEmail,
    companyId: ticket.company_id,
  });
  const residentFeedback = await loadTicketResidentFeedback(db, {
    companyId: ticket.company_id,
    ticketId: ticket.id,
  });

  return {
    ok: true,
    trackingToken,
    ticket: {
      public_reference: ticket.public_reference,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      created_at: ticket.created_at.toISOString(),
      updated_at: ticket.updated_at.toISOString(),
      ai_summary: ticket.ai_summary,
      property: ticket.property,
      residentFeedback,
      comments: ticket.comments.map((comment) => {
        if (comment.author_name) {
          return {
            id: comment.id,
            body: comment.body,
            created_at: comment.created_at.toISOString(),
            author: {
              type: comment.author_type === "resident" ? ("resident" as const) : ("management" as const),
              name: comment.author_name,
            },
          };
        }
        return {
          id: comment.id,
          body: comment.body,
          created_at: comment.created_at.toISOString(),
          author: externalAuthors.get(comment.id) || {
            type: "management" as const,
            name: comment.user.name || "Förvaltningen",
          },
        };
      }),
    },
  };
}
