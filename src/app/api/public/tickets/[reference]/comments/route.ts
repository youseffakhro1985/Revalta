import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { queueTicketNotification } from "@/lib/integrations";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

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
    const { email, body } = await request.json();
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedBody = typeof body === "string" ? body.trim() : "";

    if (!normalizedEmail.includes("@") || !normalizedBody) {
      return NextResponse.json({ error: "E-post och kommentar krävs" }, { status: 400 });
    }

    const ticket = await db.ticket.findFirst({
      where: { public_reference: reference.toUpperCase(), reporter_email: normalizedEmail },
      select: { id: true, title: true, company_id: true, user_id: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ärendet hittades inte. Kontrollera referensnummer och e-post." }, { status: 404 });
    }

    const comment = await db.ticketComment.create({
      data: {
        ticket_id: ticket.id,
        user_id: ticket.user_id,
        body: normalizedBody,
        is_internal: false,
      },
      select: {
        id: true,
        body: true,
        created_at: true,
        user: { select: { name: true } },
      },
    });

    await writeAuditLog({ id: ticket.user_id, company_id: ticket.company_id }, {
      entityType: "ticket",
      entityId: ticket.id,
      action: "public.comment_created",
      metadata: { reporterEmail: normalizedEmail, commentId: comment.id },
    });
    await queueTicketNotification({ company_id: ticket.company_id }, {
      ticketId: ticket.id,
      title: ticket.title,
      recipient: normalizedEmail,
      event: "commented",
    });

    return NextResponse.json({ success: true, comment }, { status: 201 });
  } catch (error) {
    console.error("Create public comment error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
