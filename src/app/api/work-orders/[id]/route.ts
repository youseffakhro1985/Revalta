import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { allowedTransitions, canTransition, isWorkOrderStatus, statusTimestampFields } from "@/lib/work-order-enterprise";

const priorities = new Set(["low", "normal", "high", "urgent"]);

function optionalDate(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error("Ogiltigt datum");
  return parsed;
}
function optionalMoney(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Kostnaden måste vara ett positivt belopp");
  return parsed;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;

  const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT w.*, json_build_object('id', p."id", 'name', p."name", 'address', p."address", 'city', p."city") AS property,
      CASE WHEN u."id" IS NULL THEN NULL ELSE json_build_object('id', u."id", 'designation', u."designation", 'unit_type', u."unit_type") END AS unit,
      CASE WHEN t."id" IS NULL THEN NULL ELSE json_build_object('id', t."id", 'public_reference', t."public_reference", 'title', t."title") END AS ticket,
      CASE WHEN a."id" IS NULL THEN NULL ELSE json_build_object('id', a."id", 'name', a."name", 'email', a."email") END AS assigned_to,
      json_build_object('id', c."id", 'name', c."name", 'email', c."email") AS created_by,
      CASE WHEN b."id" IS NULL THEN NULL ELSE json_build_object('id', b."id", 'name', b."name") END AS building,
      CASE WHEN ta."id" IS NULL THEN NULL ELSE json_build_object('id', ta."id", 'name', ta."name", 'category', ta."category") END AS technical_asset
    FROM "WorkOrder" w
    JOIN "Property" p ON p."id" = w."property_id"
    JOIN "User" c ON c."id" = w."created_by_id"
    LEFT JOIN "Unit" u ON u."id" = w."unit_id"
    LEFT JOIN "Ticket" t ON t."id" = w."ticket_id"
    LEFT JOIN "User" a ON a."id" = w."assigned_to_id"
    LEFT JOIN "Building" b ON b."id" = w."building_id"
    LEFT JOIN "PropertyTechnicalAsset" ta ON ta."id" = w."technical_asset_id"
    WHERE w."id" = ${id} AND w."company_id" = ${user.company_id}
    LIMIT 1
  `);
  if (!rows[0]) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const history = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT e."id", e."from_status", e."to_status", e."reason", e."metadata", e."created_at",
      json_build_object('id', u."id", 'name', u."name", 'email', u."email") AS actor
    FROM "WorkOrderStatusEvent" e JOIN "User" u ON u."id" = e."actor_user_id"
    WHERE e."work_order_id" = ${id} AND e."company_id" = ${user.company_id}
    ORDER BY e."created_at" DESC LIMIT 100
  `);
  const projects = await db.project.findMany({ where: { company_id: user.company_id, OR: [{ source_work_order_id: id }, { work_orders: { some: { id } } }] }, select: { id: true, name: true, status: true } });
  const status = String(rows[0].status);
  return NextResponse.json({ workOrder: { ...rows[0], projects, status_history: history, allowed_transitions: isWorkOrderStatus(status) ? allowedTransitions(status) : [] } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;
  const existingRows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`SELECT * FROM "WorkOrder" WHERE "id" = ${id} AND "company_id" = ${user.company_id} LIMIT 1`);
  const existing = existingRows[0];
  if (!existing) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  try {
    const body = await request.json();
    const previousStatus = String(existing.status);
    const nextStatus = body.status === undefined ? previousStatus : String(body.status);
    if (!isWorkOrderStatus(previousStatus) || !isWorkOrderStatus(nextStatus)) return NextResponse.json({ error: "Ogiltig status" }, { status: 400 });
    if (!canTransition(previousStatus, nextStatus)) return NextResponse.json({ error: `Status kan inte ändras från ${previousStatus} till ${nextStatus}` }, { status: 409 });
    const priority = body.priority === undefined ? String(existing.priority) : String(body.priority);
    if (!priorities.has(priority)) return NextResponse.json({ error: "Ogiltig prioritet" }, { status: 400 });
    const scheduledStart = body.scheduledStart === undefined ? existing.scheduled_start : optionalDate(body.scheduledStart);
    const scheduledEnd = body.scheduledEnd === undefined ? existing.scheduled_end : optionalDate(body.scheduledEnd);
    if (scheduledStart && scheduledEnd && new Date(String(scheduledEnd)) < new Date(String(scheduledStart))) return NextResponse.json({ error: "Slutdatum kan inte vara före startdatum" }, { status: 400 });
    const estimatedCost = body.estimatedCost === undefined ? existing.estimated_cost : optionalMoney(body.estimatedCost);
    const actualCost = body.actualCost === undefined ? existing.actual_cost : optionalMoney(body.actualCost);
    const reason = String(body.statusReason || body.pauseReason || "").trim() || null;
    if (["waiting_material", "waiting_resident", "cancelled"].includes(nextStatus) && previousStatus !== nextStatus && !reason) return NextResponse.json({ error: "Ange en anledning till statusändringen" }, { status: 400 });
    const timestamps = statusTimestampFields(nextStatus);
    const respondedAt = existing.responded_at || (timestamps.respondedAt && previousStatus !== nextStatus ? timestamps.respondedAt : null);
    const completedAt = ["completed", "invoiced", "closed"].includes(nextStatus) ? (existing.completed_at || timestamps.completedAt) : null;
    const closedAt = nextStatus === "closed" ? (existing.closed_at || timestamps.closedAt) : null;
    const pausedAt = ["waiting_material", "waiting_resident"].includes(nextStatus) ? (existing.paused_at || timestamps.pausedAt) : null;
    const pauseReason = ["waiting_material", "waiting_resident"].includes(nextStatus) ? reason : null;

    await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "WorkOrder" SET "status" = ${nextStatus}, "priority" = ${priority}, "scheduled_start" = ${scheduledStart ? new Date(String(scheduledStart)) : null},
          "scheduled_end" = ${scheduledEnd ? new Date(String(scheduledEnd)) : null}, "estimated_cost" = ${estimatedCost == null ? null : Number(estimatedCost)},
          "actual_cost" = ${actualCost == null ? null : Number(actualCost)}, "responded_at" = ${respondedAt ? new Date(String(respondedAt)) : null},
          "completed_at" = ${completedAt ? new Date(String(completedAt)) : null}, "closed_at" = ${closedAt ? new Date(String(closedAt)) : null},
          "paused_at" = ${pausedAt ? new Date(String(pausedAt)) : null}, "pause_reason" = ${pauseReason}, "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "company_id" = ${user.company_id}
      `);
      if (previousStatus !== nextStatus) await tx.$executeRaw(Prisma.sql`
        INSERT INTO "WorkOrderStatusEvent" ("id", "company_id", "work_order_id", "actor_user_id", "from_status", "to_status", "reason", "metadata")
        VALUES (${randomUUID()}, ${user.company_id}, ${id}, ${user.id}, ${previousStatus}, ${nextStatus}, ${reason}, ${JSON.stringify({ priority, scheduledStart, scheduledEnd, estimatedCost, actualCost })}::jsonb)
      `);
    });
    await writeAuditLog(user, { entityType: "work_order", entityId: id, action: previousStatus === nextStatus ? "work_order.updated" : "work_order.status_changed", metadata: { previousStatus, status: nextStatus, reason, priority, estimatedCost, actualCost } });
    return GET(request, { params: Promise.resolve({ id }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kunde inte uppdatera arbetsordern" }, { status: 400 });
  }
}
