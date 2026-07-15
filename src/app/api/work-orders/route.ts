import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { calculateSla, isWorkOrderStatus, nextWorkOrderNumber } from "@/lib/work-order-enterprise";

const priorities = new Set(["low", "normal", "high", "urgent"]);
const workTypes = new Set(["corrective", "preventive", "inspection", "emergency", "project", "warranty"]);
const sources = new Set(["internal", "ticket", "maintenance_plan", "inspection", "component", "resident", "supplier"]);

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
  const buildingId = body.buildingId ? String(body.buildingId).trim() : null;
  const unitId = body.unitId ? String(body.unitId).trim() : null;
  const technicalAssetId = body.technicalAssetId ? String(body.technicalAssetId).trim() : null;
  const assignedToId = body.assignedToId ? String(body.assignedToId).trim() : null;
  const ticketId = body.ticketId ? String(body.ticketId).trim() : null;
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const status = String(body.status || (assignedToId ? "assigned" : "new")).trim();
  const priority = String(body.priority || "normal").trim();
  const workType = String(body.workType || "corrective").trim();
  const source = String(body.source || (ticketId ? "ticket" : technicalAssetId ? "component" : "internal")).trim();
  const scheduledStart = parseOptionalDate(body.scheduledStart);
  const scheduledEnd = parseOptionalDate(body.scheduledEnd);
  const estimatedCost = parseOptionalMoney(body.estimatedCost);
  const billable = Boolean(body.billable);
  const requiresInspection = Boolean(body.requiresInspection);

  if (!propertyId || !title || !description) return NextResponse.json({ error: "Fastighet, rubrik och beskrivning krävs" }, { status: 400 });
  if (!isWorkOrderStatus(status) || !new Set(["new", "planned", "assigned"]).has(status)) return NextResponse.json({ error: "Ogiltig startstatus" }, { status: 400 });
  if (!priorities.has(priority)) return NextResponse.json({ error: "Ogiltig prioritet" }, { status: 400 });
  if (!workTypes.has(workType)) return NextResponse.json({ error: "Ogiltig arbetsordertyp" }, { status: 400 });
  if (!sources.has(source)) return NextResponse.json({ error: "Ogiltig källa" }, { status: 400 });
  if (scheduledStart && scheduledEnd && scheduledEnd < scheduledStart) return NextResponse.json({ error: "Slutdatum kan inte vara före startdatum" }, { status: 400 });
  if (body.estimatedCost !== undefined && body.estimatedCost !== "" && estimatedCost === null) return NextResponse.json({ error: "Beräknad kostnad måste vara ett positivt belopp" }, { status: 400 });

  const property = await db.property.findFirst({ where: { id: propertyId, company_id: user.company_id }, select: { id: true } });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });
  if (buildingId) {
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Building" WHERE "id" = ${buildingId} AND "property_id" = ${propertyId} LIMIT 1`);
    if (!rows[0]) return NextResponse.json({ error: "Byggnaden tillhör inte fastigheten" }, { status: 400 });
  }
  if (unitId) {
    const unit = await db.unit.findFirst({ where: { id: unitId, property_id: propertyId }, select: { id: true } });
    if (!unit) return NextResponse.json({ error: "Enheten tillhör inte fastigheten" }, { status: 400 });
  }
  if (technicalAssetId) {
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "PropertyTechnicalAsset" WHERE "id" = ${technicalAssetId} AND "property_id" = ${propertyId} AND "company_id" = ${user.company_id} LIMIT 1`);
    if (!rows[0]) return NextResponse.json({ error: "Komponenten tillhör inte fastigheten" }, { status: 400 });
  }
  if (assignedToId) {
    const assignee = await db.user.findFirst({ where: { id: assignedToId, company_id: user.company_id, status: "active" }, select: { id: true } });
    if (!assignee) return NextResponse.json({ error: "Ansvarig användare hittades inte" }, { status: 400 });
  }
  if (ticketId) {
    const ticket = await db.ticket.findFirst({ where: { id: ticketId, company_id: user.company_id }, select: { id: true } });
    if (!ticket) return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
  }

  const createdAt = new Date();
  const sla = calculateSla(priority, createdAt);
  const workOrder = await db.$transaction(async (tx) => {
    const number = await nextWorkOrderNumber(tx, user.company_id!, createdAt);
    const created = await tx.workOrder.create({
      data: { company_id: user.company_id!, property_id: propertyId, unit_id: unitId, assigned_to_id: assignedToId, ticket_id: ticketId, created_by_id: user.id, title, description, status, priority, scheduled_start: scheduledStart, scheduled_end: scheduledEnd, estimated_cost: estimatedCost },
    });
    await tx.$executeRaw(Prisma.sql`
      UPDATE "WorkOrder" SET "work_order_number" = ${number}, "building_id" = ${buildingId}, "technical_asset_id" = ${technicalAssetId},
        "work_type" = ${workType}, "source" = ${source}, "sla_response_due_at" = ${sla.responseDueAt},
        "sla_resolution_due_at" = ${sla.resolutionDueAt}, "billable" = ${billable}, "requires_inspection" = ${requiresInspection}
      WHERE "id" = ${created.id} AND "company_id" = ${user.company_id}
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "WorkOrderStatusEvent" ("id", "company_id", "work_order_id", "actor_user_id", "from_status", "to_status", "reason", "metadata")
      VALUES (${randomUUID()}, ${user.company_id}, ${created.id}, ${user.id}, NULL, ${status}, 'Arbetsorder skapad', ${JSON.stringify({ number, priority, workType, source })}::jsonb)
    `);
    return { ...created, work_order_number: number, work_type: workType, source, sla_response_due_at: sla.responseDueAt, sla_resolution_due_at: sla.resolutionDueAt, billable, requires_inspection: requiresInspection };
  });

  await writeAuditLog(user, { entityType: "work_order", entityId: workOrder.id, action: "work_order.created", metadata: { workOrderNumber: workOrder.work_order_number, propertyId, buildingId, unitId, technicalAssetId, assignedToId, ticketId, status, priority, workType, source, estimatedCost } });
  return NextResponse.json({ workOrder }, { status: 201 });
}
