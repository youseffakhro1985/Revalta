import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { isAssignedWorkAccessible } from "@/lib/assigned-work-access";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att återställa arbetsordrar" }, { status: 403 });
    }
    if (!user.company_id) {
      return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    }
    const companyId = user.company_id;

    const { id } = await params;
    const existing = await db.workOrder.findFirst({
      where: { id, company_id: companyId, deleted_at: { not: null } },
      select: {
        id: true,
        title: true,
        status: true,
        ticket_id: true,
        assigned_to_id: true,
        property: { select: { deleted_at: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Arbetsordern hittades inte eller är redan aktiv" }, { status: 404 });
    }
    if (!isAssignedWorkAccessible(user, existing.assigned_to_id)) {
      return NextResponse.json({ error: "Arbetsordern hittades inte eller är redan aktiv" }, { status: 404 });
    }
    if (existing.property?.deleted_at) {
      return NextResponse.json(
        { error: "Arbetsordern kan inte återställas eftersom fastigheten är borttagen. Återställ fastigheten först." },
        { status: 409 },
      );
    }

    if (existing.ticket_id) {
      const ticketConflict = await db.workOrder.findFirst({
        where: {
          ticket_id: existing.ticket_id,
          id: { not: existing.id },
        },
        select: { id: true, deleted_at: true },
      });
      if (ticketConflict) {
        return NextResponse.json(
          {
            error: ticketConflict.deleted_at
              ? "En annan borttagen arbetsorder är fortfarande kopplad till samma ärende."
              : "En annan aktiv arbetsorder är redan kopplad till samma ärende.",
          },
          { status: 409 },
        );
      }

      const ticket = await db.ticket.findFirst({
        where: { id: existing.ticket_id, company_id: companyId },
        select: { id: true, deleted_at: true },
      });
      if (!ticket) {
        return NextResponse.json({ error: "Kopplat ärende hittades inte" }, { status: 409 });
      }
      if (ticket.deleted_at) {
        return NextResponse.json(
          { error: "Arbetsordern kan inte återställas eftersom det kopplade ärendet är borttaget. Återställ ärendet först." },
          { status: 409 },
        );
      }
    }

    // Restore + audit log in one transaction: an audit-write failure must never
    // leave the work order un-deleted while the caller is told the request failed.
    const restored = await db.$transaction(async (tx) => {
      const restoreResult = await tx.workOrder.updateMany({
        where: { id: existing.id, company_id: companyId, deleted_at: { not: null } },
        data: { deleted_at: null },
      });
      if (restoreResult.count === 0) return false;

      await writeAuditLog(user, {
        entityType: "work_order",
        entityId: existing.id,
        action: "work_order.restored",
        metadata: { title: existing.title, previousStatus: existing.status, softDelete: true },
      }, tx);
      return true;
    });
    if (!restored) {
      return NextResponse.json({ error: "Arbetsordern hittades inte eller är redan aktiv" }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: existing.id });
  } catch (error) {
    console.error("Restore work order error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
