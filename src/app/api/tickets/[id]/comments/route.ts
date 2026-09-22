import db from "@/lib/db";
import { canManageTickets, getCurrentUser, requireCompanyUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { notifyTicketReporter } from "@/lib/ticket-reporter-notify";
import { isAssignedWorkAccessible, notFoundTicket } from "@/lib/assigned-work-access";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/tickets/[id]/comments" });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rawUser = await getCurrentUser();
    if (!rawUser) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    const user = requireCompanyUser(rawUser);
    if (!user) return NextResponse.json({ error: "En aktiv organisation och personalbehörighet krävs" }, { status: 403 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att kommentera ärenden" }, { status: 403 });
    }
    const { id } = await params;
    const { body, isInternal } = await request.json();
    const normalizedBody = typeof body === "string" ? body.trim() : "";

    if (!normalizedBody) {
      return NextResponse.json({ error: "Kommentar krävs" }, { status: 400 });
    }

    const ticket = await db.ticket.findFirst({
      where: { id, deleted_at: null, ...tenantWhere(user), OR: [{ property_id: null }, { property: { deleted_at: null } }] },
      select: { id: true, title: true, assigned_to_id: true, status: true, public_reference: true, reporter_email: true, reporter_phone: true },
    });

    if (!ticket) return notFoundTicket();
    if (!isAssignedWorkAccessible(user, ticket.assigned_to_id)) return notFoundTicket();

    const authorName = user.name || user.email;
    const comment = await db.$transaction(async (tx) => {
      const created = await tx.ticketComment.create({
        data: {
          ticket_id: ticket.id,
          user_id: user.id,
          body: normalizedBody,
          is_internal: Boolean(isInternal),
          author_type: "staff",
          author_name: authorName,
          author_email: user.email,
        },
        select: {
          id: true,
          body: true,
          is_internal: true,
          created_at: true,
          author_type: true,
          author_name: true,
          author_email: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      await writeAuditLog(user, {
        entityType: "ticket",
        entityId: ticket.id,
        action: "ticket.comment_created",
        metadata: { commentId: created.id, isInternal: created.is_internal },
      }, tx);

      return created;
    });

    if (!comment.is_internal) {
      try {
        await notifyTicketReporter(user, ticket, "commented");
      } catch (notificationError) {
        logger.error("Ticket reporter comment notification failed", notificationError);
      }
    }

    return NextResponse.json({ success: true, comment }, { status: 201 });
  } catch (error) {
    logger.error("Create ticket comment error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
