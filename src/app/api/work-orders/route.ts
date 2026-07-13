import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

function parseOptionalDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseOptionalMoney(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const workOrders = await db.workOrder.findMany({
    where: { company_id: user.company_id },
    orderBy: [{ status: "asc" }, { scheduled_start: "asc" }, { created_at: "desc" }],
    take: 500,
    include: {
      property: { select: { id: true, name: true, address: true, city: true } },
      unit: { select: { id: true, designation: true, unit_type: true } },
      ticket: { select: { id: true, public_reference: true, title: true } },
      assigned_to: { select: { id: true, name: true, email: true } },
      projects: { select: { id: true, name: true, status: true } },
    },
  });

  return NextResponse.json({ workOrders });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const body = await request.json();
  const propertyId = String(body.propertyId || "").trim();
  const unitId = body.unitId ? String(body.unitId).trim() : null;
  const assignedToId = body.assignedToId ? String(body.assignedToId).trim() : null;
  const ticketId = body.ticketId ? String(body.ticketId).trim() : null;
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const status = String(body.status || "planned").trim();
  const priority = String(body.priority || "normal").trim();
  const scheduledStart = parseOptionalDate(body.scheduledStart);
  const scheduledEnd = parseOptionalDate(body.scheduledEnd);
  const estimatedCost = parseOptionalMoney(body.estimatedCost);

  if (!propertyId || !title || !description) {
    return NextResponse.json({ error: "Fastighet, rubrik och beskrivning krävs" }, { status: 400 });
  }
  if (body.estimatedCost !== undefined && body.estimatedCost !== "" && estimatedCost === null) {
    return NextResponse.json({ error: "Beräknad kostnad måste vara ett positivt belopp" }, { status: 400 });
  }

  const property = await db.property.findFirst({
    where: { id: propertyId, company_id: user.company_id },
    select: { id: true },
  });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  if (unitId) {
    const unit = await db.unit.findFirst({ where: { id: unitId, property_id: propertyId }, select: { id: true } });
    if (!unit) return NextResponse.json({ error: "Enheten tillhör inte fastigheten" }, { status: 400 });
  }

  if (assignedToId) {
    const assignee = await db.user.findFirst({ where: { id: assignedToId, company_id: user.company_id, status: "active" }, select: { id: true } });
    if (!assignee) return NextResponse.json({ error: "Ansvarig användare hittades inte" }, { status: 400 });
  }

  if (ticketId) {
    const ticket = await db.ticket.findFirst({ where: { id: ticketId, company_id: user.company_id }, select: { id: true } });
    if (!ticket) return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
  }

  const workOrder = await db.workOrder.create({
    data: {
      company_id: user.company_id,
      property_id: propertyId,
      unit_id: unitId,
      assigned_to_id: assignedToId,
      ticket_id: ticketId,
      created_by_id: user.id,
      title,
      description,
      status,
      priority,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      estimated_cost: estimatedCost,
    },
  });

  await writeAuditLog(user, {
    entityType: "work_order",
    entityId: workOrder.id,
    action: "work_order.created",
    metadata: { propertyId, unitId, assignedToId, ticketId, status, priority, estimatedCost },
  });

  return NextResponse.json({ workOrder }, { status: 201 });
}