import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { extractPortalTrackingToken, verifyPortalTrackingToken } from "@/lib/portal-tracking";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  loadTicketResidentFeedback,
  TICKET_RESIDENT_FEEDBACK_ACTION,
} from "@/lib/ticket-resident-feedback";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/public/tickets/[reference]/feedback" });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`public-feedback:${ip}`, 10, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "För många försök. Vänta en stund och prova igen." }, { status: 429 });
    }

    const { reference } = await params;
    const bodyJson = await request.json().catch(() => null);
    if (!bodyJson || typeof bodyJson !== "object" || Array.isArray(bodyJson)) {
      return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });
    }

    const email = typeof bodyJson.email === "string" ? bodyJson.email.trim().toLowerCase() : "";
    const tracking = verifyPortalTrackingToken(
      typeof bodyJson.token === "string" ? bodyJson.token : extractPortalTrackingToken(request),
    );
    const authorizedEmail = tracking?.email || email;
    const rating = Number(bodyJson.rating);
    const comment = typeof bodyJson.comment === "string" ? bodyJson.comment.trim() : "";

    if (!authorizedEmail.includes("@") || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "E-post eller spårningstoken och betyg 1–5 krävs" }, { status: 400 });
    }
    if (authorizedEmail.length > 254 || comment.length > 1000) {
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
        status: true,
        company_id: true,
        user_id: true,
        public_reference: true,
      },
    });

    if (!ticket?.company_id) {
      return NextResponse.json({ error: "Ärendet hittades inte. Kontrollera referensnummer och e-post." }, { status: 404 });
    }
    if (!["closed", "completed"].includes(ticket.status)) {
      return NextResponse.json({ error: "Återkoppling kan lämnas när ärendet är avslutat." }, { status: 409 });
    }

    const existing = await loadTicketResidentFeedback(db, {
      companyId: ticket.company_id,
      ticketId: ticket.id,
    });
    if (existing) {
      return NextResponse.json({ error: "Återkoppling är redan lämnad för det här ärendet.", feedback: existing }, { status: 409 });
    }

    const submittedAt = new Date();
    await writeAuditLog({ id: ticket.user_id, company_id: ticket.company_id }, {
      entityType: "ticket",
      entityId: ticket.id,
      action: TICKET_RESIDENT_FEEDBACK_ACTION,
      metadata: {
        rating,
        comment: comment || null,
        publicReference: ticket.public_reference,
        source: "public_portal",
        schemaVersion: 1,
      },
    });

    return NextResponse.json({
      success: true,
      feedback: {
        rating,
        comment: comment || null,
        submittedAt: submittedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    logger.error("Create public ticket feedback error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
