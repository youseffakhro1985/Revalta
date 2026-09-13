import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { queueSmsNotification } from "@/lib/integrations";
import { isAssignedWorkAccessible, notFoundTicket } from "@/lib/assigned-work-access";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/tickets/[id]/sms" });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att skicka SMS" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await db.ticket.findFirst({
      where: { id, deleted_at: null, ...tenantWhere(user), OR: [{ property_id: null }, { property: { deleted_at: null } }] },
      select: {
        id: true,
        title: true,
        public_reference: true,
        reporter_phone: true,
        assigned_to_id: true,
      },
    });
    if (!existing) return notFoundTicket();
    if (!isAssignedWorkAccessible(user, existing.assigned_to_id)) return notFoundTicket();
    if (!existing.reporter_phone) {
      return NextResponse.json({ error: "Ärendet saknar telefonnummer" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const customMessage = typeof body?.message === "string" ? body.message.trim() : "";
    const reference = existing.public_reference || existing.id.slice(0, 8);
    const message = (customMessage || `Uppdatering från Revalta om ärende ${reference}: ${existing.title}`).slice(0, 300);

    const event = await queueSmsNotification(user, {
      ticketId: existing.id,
      recipient: existing.reporter_phone,
      message,
    });

    return NextResponse.json({
      success: true,
      status: event.status,
      recipient: existing.reporter_phone,
    });
  } catch (error) {
    logger.error("Send ticket SMS error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
