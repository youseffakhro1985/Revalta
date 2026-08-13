import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import {
  canAccessResidentPortal,
  getCurrentUser,
  isResident,
  requireCompanyMember,
} from "@/lib/current-user";
import { queueTicketNotification } from "@/lib/integrations";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  canCommentOnResidentPortalTicket,
  findAccessibleResidentPortalTicket,
} from "@/lib/resident-portal-tickets";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/resident-portal/tickets/[id]/comments" });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireCompanyMember(await getCurrentUser());
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canAccessResidentPortal(user.role) || !canCommentOnResidentPortalTicket(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att kommentera" }, { status: 403 });
    }

    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`resident-comment:${user.id}:${ip}`, 20, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "För många kommentarer. Vänta en stund och prova igen." }, { status: 429 });
    }

    const { id } = await params;
    const bodyJson = await request.json().catch(() => ({})) as { body?: unknown };
    const body = typeof bodyJson.body === "string" ? bodyJson.body.trim() : "";
    if (!body) {
      return NextResponse.json({ error: "Kommentaren får inte vara tom" }, { status: 400 });
    }
    if (body.length > 5_000) {
      return NextResponse.json({ error: "Kommentaren är för lång" }, { status: 400 });
    }

    const ticket = await findAccessibleResidentPortalTicket(user, id);
    if (!ticket?.company_id) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    const authorName = isResident(user.role)
      ? (user.name?.trim() || ticket.reporter_name || "Boende")
      : (user.name?.trim() || "Förvaltningen");
    const authorType = isResident(user.role) ? "resident" : "staff";
    const authorEmail = isResident(user.role)
      ? (ticket.reporter_email || user.email)
      : user.email;

    const comment = await db.ticketComment.create({
      data: {
        ticket_id: ticket.id,
        user_id: isResident(user.role) ? ticket.user_id : user.id,
        body,
        is_internal: false,
        author_type: authorType,
        author_name: authorName,
        author_email: authorEmail,
      },
      select: {
        id: true,
        body: true,
        created_at: true,
        author_type: true,
        author_name: true,
      },
    });

    await writeAuditLog(user, {
      entityType: "ticket",
      entityId: ticket.id,
      action: isResident(user.role) ? "resident_portal.comment_created" : "ticket.comment_created",
      metadata: {
        commentId: comment.id,
        accessMode: isResident(user.role) ? "resident_self_service" : "operations",
        schemaVersion: 2,
      },
    });

    if (isResident(user.role) && ticket.company_id) {
      await queueTicketNotification({ company_id: ticket.company_id }, {
        ticketId: ticket.id,
        title: ticket.title,
        recipient: authorEmail,
        event: "commented",
      });
    }

    return NextResponse.json({
      success: true,
      comment: {
        id: comment.id,
        body: comment.body,
        created_at: comment.created_at,
        author: {
          type: comment.author_type === "resident" ? "resident" : "management",
          name: comment.author_name || authorName,
        },
      },
    }, { status: 201 });
  } catch (error) {
    logger.error("Create resident portal comment error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
