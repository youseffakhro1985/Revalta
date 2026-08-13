import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { isAssignedWorkAccessible, notFoundTicket } from "@/lib/assigned-work-access";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/tickets/[id]/restore" });

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att återställa ärenden" }, { status: 403 });
    }
    if (!user.company_id) {
      return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    }

    const { id } = await params;
    const existing = await db.ticket.findFirst({
      where: { id, company_id: user.company_id, deleted_at: { not: null } },
      select: {
        id: true,
        title: true,
        status: true,
        property_id: true,
        assigned_to_id: true,
        property: { select: { deleted_at: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Ärendet hittades inte eller är redan aktivt" }, { status: 404 });
    }
    if (!isAssignedWorkAccessible(user, existing.assigned_to_id)) return notFoundTicket();
    if (existing.property_id && existing.property?.deleted_at) {
      return NextResponse.json(
        { error: "Ärendet kan inte återställas eftersom den kopplade fastigheten är borttagen. Återställ fastigheten först." },
        { status: 409 },
      );
    }

    // Restore + audit log in one transaction: an audit-write failure must never
    // leave the ticket un-deleted while the caller is told the request failed.
    const restored = await db.$transaction(async (tx) => {
      const restoreResult = await tx.ticket.updateMany({
        where: { id: existing.id, company_id: user.company_id, deleted_at: { not: null } },
        data: { deleted_at: null },
      });
      if (restoreResult.count === 0) return false;

      await writeAuditLog(user, {
        entityType: "ticket",
        entityId: existing.id,
        action: "ticket.restored",
        metadata: { title: existing.title, previousStatus: existing.status, softDelete: true },
      }, tx);
      return true;
    });
    if (!restored) {
      return NextResponse.json({ error: "Ärendet hittades inte eller är redan aktivt" }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: existing.id });
  } catch (error) {
    logger.error("Restore ticket error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
