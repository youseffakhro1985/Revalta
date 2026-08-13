import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { queueTicketNotification } from "@/lib/integrations";
import { extractPortalTrackingToken, verifyPortalTrackingToken } from "@/lib/portal-tracking";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/public/tickets/[reference]/comments" });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`public-comment:${ip}`, 10, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "För många kommentarer. Vänta en stund och prova igen." }, { status: 429 });
    }

    const { reference } = await params;
    const bodyJson = await request.json();
    const email = typeof bodyJson.email === "string" ? bodyJson.email.trim().toLowerCase() : "";
    const name = typeof bodyJson.name === "string" ? bodyJson.name.trim() : "";
    const body = typeof bodyJson.body === "string" ? bodyJson.body.trim() : "";
    const tracking = verifyPortalTrackingToken(
      typeof bodyJson.token === "string" ? bodyJson.token : extractPortalTrackingToken(request),
    );
    const authorizedEmail = tracking?.email || email;

    if (!authorizedEmail.includes("@") || !body) {
      return NextResponse.json({ error: "E-post eller spårningstoken och kommentar krävs" }, { status: 400 });
    }
    if (authorizedEmail.length > 254 || name.length > 120 || body.length > 5_000) {
      return NextResponse.json({ error: "En eller flera uppgifter är för långa" }, { status: 400 });
    }
    if (tracking && tracking.reference !== reference.toUpperCase()) {
      return NextResponse.json({ error: "Ogiltig spårningstoken" }, { status: 403 });
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
        title: true,
        company_id: true,
        user_id: true,
        reporter_name: true,
        reporter_email: true,
      },
    });

    if (!ticket?.company_id) {
      return NextResponse.json({ error: "Ärendet hittades inte. Kontrollera referensnummer och e-post." }, { status: 404 });
    }

    const authorName = name || ticket.reporter_name || "Boende";
    const authorEmail = ticket.reporter_email || authorizedEmail;
    const comment = await db.ticketComment.create({
      data: {
        ticket_id: ticket.id,
        user_id: ticket.user_id,
        body,
        is_internal: false,
        author_type: "resident",
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

    await writeAuditLog({ id: ticket.user_id, company_id: ticket.company_id }, {
      entityType: "ticket",
      entityId: ticket.id,
      action: "public.comment_created",
      metadata: {
        reporterName: authorName,
        reporterEmail: authorEmail,
        commentId: comment.id,
        schemaVersion: 2,
      },
    });
    await queueTicketNotification({ company_id: ticket.company_id }, {
      ticketId: ticket.id,
      title: ticket.title,
      recipient: authorizedEmail,
      event: "commented",
    });

    return NextResponse.json({
      success: true,
      comment: {
        id: comment.id,
        body: comment.body,
        created_at: comment.created_at,
        author: { type: "resident", name: comment.author_name || authorName },
      },
    }, { status: 201 });
  } catch (error) {
    logger.error("Create public comment error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
