import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  addWorkOrderStatusEvent,
  allocateWorkOrderNumber,
  calculateWorkOrderSla,
  setWorkOrderEnterpriseFields,
} from "@/lib/work-order-enterprise-core";
import { normalizeWorkOrderPriority } from "@/lib/work-order-workflow";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att visa arbetsordrar" }, { status: 403 });
  }
  if (!user.company_id) {
    return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  }

  const { id } = await params;
  const ticket = await db.ticket.findFirst({
    where: { id, company_id: user.company_id, deleted_at: null },
    select: {
      id: true,
      property_id: true,
      assigned_to_id: true,
    },
  });

  if (!ticket) return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });

  const workOrder = await db.workOrder.findFirst({
    where: { ticket_id: ticket.id, company_id: user.company_id, deleted_at: null },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      scheduled_start: true,
      scheduled_end: true,
      created_at: true,
      assigned_to: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return NextResponse.json({
    workOrder,
    canCreate: Boolean(ticket.property_id),
    suggestedAssignedToId: ticket.assigned_to_id,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att skapa arbetsordrar" }, { status: 403 });
  }
  if (!user.company_id) {
    return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const assignedToId = body.assignedToId ? String(body.assignedToId).trim() : null;
  const unitId = body.unitId ? String(body.unitId).trim() : null;
  const scheduledStart = body.scheduledStart ? new Date(String(body.scheduledStart)) : null;
  const scheduledEnd = body.scheduledEnd ? new Date(String(body.scheduledEnd)) : null;
  const estimatedCost = body.estimatedCost === "" || body.estimatedCost === undefined
    ? null
    : Number(body.estimatedCost);

  if (scheduledStart && Number.isNaN(scheduledStart.getTime())) {
    return NextResponse.json({ error: "Ogiltigt startdatum" }, { status: 400 });
  }
  if (scheduledEnd && Number.isNaN(scheduledEnd.getTime())) {
    return NextResponse.json({ error: "Ogiltigt slutdatum" }, { status: 400 });
  }
  if (scheduledStart && scheduledEnd && scheduledEnd <= scheduledStart) {
    return NextResponse.json({ error: "Sluttiden måste ligga efter starttiden" }, { status: 400 });
  }
  if (estimatedCost !== null && (!Number.isFinite(estimatedCost) || estimatedCost < 0)) {
    return NextResponse.json({ error: "Ogiltig beräknad kostnad" }, { status: 400 });
  }

  const ticket = await db.ticket.findFirst({
    where: { id, company_id: user.company_id, deleted_at: null },
    select: {
      id: true,
      property_id: true,
      assigned_to_id: true,
      status: true,
      title: true,
      description: true,
      priority: true,
    },
  });
  if (!ticket) return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
  if (!ticket.property_id) {
    return NextResponse.json(
      { error: "Ärendet måste kopplas till en fastighet innan en arbetsorder kan skapas" },
      { status: 409 },
    );
  }
  const activeWorkOrder = await db.workOrder.findFirst({
    where: { ticket_id: ticket.id, company_id: user.company_id, deleted_at: null },
    select: { id: true },
  });
  if (activeWorkOrder) {
    return NextResponse.json({ workOrderId: activeWorkOrder.id, created: false });
  }

  if (unitId) {
    const unit = await db.unit.findFirst({
      where: { id: unitId, property_id: ticket.property_id },
      select: { id: true },
    });
    if (!unit) {
      return NextResponse.json({ error: "Enheten tillhör inte ärendets fastighet" }, { status: 400 });
    }
  }

  if (assignedToId) {
    const assignee = await db.user.findFirst({
      where: { id: assignedToId, company_id: user.company_id, status: "active" },
      select: { id: true },
    });
    if (!assignee) {
      return NextResponse.json({ error: "Ansvarig användare hittades inte" }, { status: 400 });
    }
  }

  const priority = normalizeWorkOrderPriority(ticket.priority);
  const createdAt = new Date();
  const sla = calculateWorkOrderSla(createdAt, priority);

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.workOrder.findUnique({
        where: { ticket_id: ticket.id },
        select: { id: true, deleted_at: true },
      });
      if (existing && !existing.deleted_at) {
        return { id: existing.id, created: false, workOrderNumber: null };
      }
      if (existing?.deleted_at) {
        // Free unique ticket_id so a new work order can be created after soft-delete.
        await tx.workOrder.update({
          where: { id: existing.id },
          data: { ticket_id: null },
        });
      }

      const workOrderNumber = await allocateWorkOrderNumber(tx, user.company_id!, createdAt);
      const status = assignedToId || ticket.assigned_to_id ? "planned" : "new";
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
          status,
          priority,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          estimated_cost: estimatedCost,
          created_at: createdAt,
        },
        select: { id: true },
      });

      await setWorkOrderEnterpriseFields(tx, {
        workOrderId: created.id,
        companyId: user.company_id!,
        workOrderNumber,
        workType: "corrective",
        source: "ticket",
        responseDueAt: sla.responseDueAt,
        resolutionDueAt: sla.resolutionDueAt,
      });
      await addWorkOrderStatusEvent(tx, {
        companyId: user.company_id!,
        workOrderId: created.id,
        actorUserId: user.id,
        fromStatus: null,
        toStatus: status,
        reason: "Skapad från felanmälan",
        metadata: { ticketId: ticket.id, workOrderNumber, unitId },
      });
      await tx.ticket.updateMany({
        where: { id: ticket.id, company_id: user.company_id! },
        data: {
          status: ticket.status === "new" ? "received" : ticket.status,
          assigned_to_id: assignedToId || ticket.assigned_to_id,
        },
      });

      return { id: created.id, created: true, workOrderNumber };
    });

    await writeAuditLog(user, {
      entityType: "work_order",
      entityId: result.id,
      action: result.created ? "work_order.created_from_ticket" : "work_order.reused_from_ticket",
      metadata: {
        ticketId: ticket.id,
        propertyId: ticket.property_id,
        unitId,
        assignedToId: assignedToId || ticket.assigned_to_id,
        estimatedCost,
        workOrderNumber: result.workOrderNumber,
      },
    });

    return NextResponse.json(
      { workOrderId: result.id, created: result.created },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    const concurrent = await db.workOrder.findFirst({
      where: { ticket_id: ticket.id, company_id: user.company_id, deleted_at: null },
      select: { id: true },
    });
    if (concurrent) {
      return NextResponse.json({ workOrderId: concurrent.id, created: false });
    }
    console.error("Create work order from ticket error:", error);
    return NextResponse.json({ error: "Kunde inte skapa arbetsorder från ärendet" }, { status: 500 });
  }
}
