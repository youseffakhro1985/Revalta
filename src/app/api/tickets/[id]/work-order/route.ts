import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const assignedToId = body.assignedToId ? String(body.assignedToId).trim() : null;
  const unitId = body.unitId ? String(body.unitId).trim() : null;
  const scheduledStart = body.scheduledStart ? new Date(String(body.scheduledStart)) : null;
  const scheduledEnd = body.scheduledEnd ? new Date(String(body.scheduledEnd)) : null;
  const estimatedCost = body.estimatedCost === "" || body.estimatedCost === undefined ? null : Number(body.estimatedCost);

  if (scheduledStart && Number.isNaN(scheduledStart.getTime())) {
    return NextResponse.json({ error: "Ogiltigt startdatum" }, { status: 400 });
  }
  if (scheduledEnd && Number.isNaN(scheduledEnd.getTime())) {
    return NextResponse.json({ error: "Ogiltigt slutdatum" }, { status: 400 });
  }
  if (estimatedCost !== null && (!Number.isFinite(estimatedCost) || estimatedCost < 0)) {
    return NextResponse.json({ error: "Ogiltig beräknad kostnad" }, { status: 400 });
  }

  const ticket = await db.ticket.findFirst({
    where: { id, company_id: user.company_id },
    include: { work_order: { select: { id: true } } },
  });
  if (!ticket) return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
  if (!ticket.property_id) return NextResponse.json({ error: "Ärendet måste kopplas till en fastighet först" }, { status: 400 });
  if (ticket.work_order) return NextResponse.json({ error: "Ärendet har redan en arbetsorder", workOrderId: ticket.work_order.id }, { status: 409 });

  if (unitId) {
    const unit = await db.unit.findFirst({ where: { id: unitId, property_id: ticket.property_id }, select: { id: true } });
    if (!unit) return NextResponse.json({ error: "Enheten tillhör inte ärendets fastighet" }, { status: 400 });
  }

  if (assignedToId) {
    const assignee = await db.user.findFirst({ where: { id: assignedToId, company_id: user.company_id, status: "active" }, select: { id: true } });
    if (!assignee) return NextResponse.json({ error: "Ansvarig användare hittades inte" }, { status: 400 });
  }

  const workOrder = await db.$transaction(async (tx) => {
    const created = await tx.workOrder.create({
      data: {
        company_id: user.company_id!,
        ticket_id: ticket.id,
        property_id: ticket.property_id!,
        unit_id: unitId,
        assigned_to_id: assignedToId || ticket.assigned_to_id,
        created_by_id: user.id,
        title: ticket.title,
        description: ticket.description,
        status: "planned",
        priority: ticket.priority,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        estimated_cost: estimatedCost,
      },
    });

    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: ticket.status === "new" ? "received" : ticket.status,
        assigned_to_id: assignedToId || ticket.assigned_to_id,
      },
    });

    return created;
  });

  await writeAuditLog(user, {
    entityType: "work_order",
    entityId: workOrder.id,
    action: "work_order.created_from_ticket",
    metadata: { ticketId: ticket.id, propertyId: ticket.property_id, unitId, assignedToId, estimatedCost },
  });

  return NextResponse.json({ workOrder }, { status: 201 });
}