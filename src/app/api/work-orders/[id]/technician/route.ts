import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";

const closedStatuses = new Set(["completed", "invoiced", "closed", "cancelled"]);

function nonNegative(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} måste vara noll eller större`);
  return parsed;
}

async function resolveWorkOrder(id: string, companyId: string) {
  const rows = await db.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
    SELECT "id", "status" FROM "WorkOrder"
    WHERE "id" = ${id} AND "company_id" = ${companyId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function syncActualCost(tx: Prisma.TransactionClient, id: string, companyId: string) {
  await tx.$executeRaw(Prisma.sql`
    UPDATE "WorkOrder" w SET
      "actual_cost" = COALESCE((
        SELECT SUM(e."total_amount")
        FROM "WorkOrderExecutionEntry" e
        WHERE e."work_order_id" = w."id"
          AND e."company_id" = ${companyId}
          AND COALESCE(e."is_voided", false) = false
      ), 0),
      "updated_at" = CURRENT_TIMESTAMP
    WHERE w."id" = ${id} AND w."company_id" = ${companyId}
  `);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;
  const workOrder = await resolveWorkOrder(id, user.company_id);
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const timers = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT t.*,
      CASE WHEN t."status" = 'running' AND t."segment_started_at" IS NOT NULL
        THEN t."accumulated_minutes" + FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - t."segment_started_at")) / 60)::integer
        ELSE t."accumulated_minutes" END AS "effective_minutes"
    FROM "WorkOrderTimerSession" t
    WHERE t."company_id" = ${user.company_id}
      AND t."work_order_id" = ${id}
      AND t."user_id" = ${user.id}
      AND t."status" IN ('running', 'paused')
    ORDER BY t."created_at" DESC LIMIT 1
  `);

  const summaryRows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT
      COALESCE(SUM(CASE WHEN "entry_type" = 'time' THEN "minutes" ELSE 0 END), 0)::integer AS "minutes",
      COALESCE(SUM(CASE WHEN "entry_type" = 'time' THEN "total_amount" ELSE 0 END), 0)::double precision AS "labor_cost",
      COALESCE(SUM(CASE WHEN "entry_type" = 'material' THEN "total_amount" ELSE 0 END), 0)::double precision AS "material_cost",
      COALESCE(SUM(CASE WHEN "entry_type" = 'travel' THEN "total_amount" ELSE 0 END), 0)::double precision AS "travel_cost",
      COALESCE(SUM(CASE WHEN "entry_type" = 'external' THEN "total_amount" ELSE 0 END), 0)::double precision AS "external_cost",
      COALESCE(SUM("total_amount"), 0)::double precision AS "total_cost"
    FROM "WorkOrderExecutionEntry"
    WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id}
      AND COALESCE("is_voided", false) = false
  `);

  return NextResponse.json({ workOrder, timer: timers[0] ?? null, summary: summaryRows[0] ?? {} });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;
  const workOrder = await resolveWorkOrder(id, user.company_id);
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  try {
    const body = await request.json();
    const action = String(body.action || "");

    if (action === "timer.start") {
      if (closedStatuses.has(workOrder.status)) return NextResponse.json({ error: "En avslutad arbetsorder kan inte startas" }, { status: 409 });
      const hourlyRate = nonNegative(body.hourlyRate ?? 0, "Timpriset");
      const timerId = randomUUID();
      await db.$executeRaw(Prisma.sql`
        INSERT INTO "WorkOrderTimerSession"
          ("id", "company_id", "work_order_id", "user_id", "status", "description", "segment_started_at", "hourly_rate")
        VALUES
          (${timerId}, ${user.company_id}, ${id}, ${user.id}, 'running', ${String(body.description || "").trim() || null}, CURRENT_TIMESTAMP, ${hourlyRate})
      `);
      await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.timer_started", metadata: { timerId, hourlyRate } });
      return NextResponse.json({ id: timerId }, { status: 201 });
    }

    const activeRows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT * FROM "WorkOrderTimerSession"
      WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id}
        AND "user_id" = ${user.id} AND "status" IN ('running', 'paused')
      ORDER BY "created_at" DESC LIMIT 1
    `);
    const timer = activeRows[0];

    if (["timer.pause", "timer.resume", "timer.stop", "timer.cancel"].includes(action) && !timer) {
      return NextResponse.json({ error: "Ingen aktiv timer hittades" }, { status: 404 });
    }

    if (action === "timer.pause") {
      if (timer.status !== "running") return NextResponse.json({ error: "Timern är inte igång" }, { status: 409 });
      await db.$executeRaw(Prisma.sql`
        UPDATE "WorkOrderTimerSession" SET
          "accumulated_minutes" = "accumulated_minutes" + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "segment_started_at")) / 60)::integer),
          "segment_started_at" = NULL, "status" = 'paused', "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${String(timer.id)} AND "company_id" = ${user.company_id}
      `);
      await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.timer_paused", metadata: { timerId: timer.id } });
      return NextResponse.json({ success: true });
    }

    if (action === "timer.resume") {
      if (timer.status !== "paused") return NextResponse.json({ error: "Timern är inte pausad" }, { status: 409 });
      await db.$executeRaw(Prisma.sql`
        UPDATE "WorkOrderTimerSession" SET "segment_started_at" = CURRENT_TIMESTAMP, "status" = 'running', "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${String(timer.id)} AND "company_id" = ${user.company_id}
      `);
      await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.timer_resumed", metadata: { timerId: timer.id } });
      return NextResponse.json({ success: true });
    }

    if (action === "timer.cancel") {
      const reason = String(body.reason || "").trim();
      if (!reason) return NextResponse.json({ error: "Ange varför timern avbryts" }, { status: 400 });
      await db.$executeRaw(Prisma.sql`
        UPDATE "WorkOrderTimerSession" SET "status" = 'cancelled', "stopped_at" = CURRENT_TIMESTAMP, "description" = CONCAT(COALESCE("description", ''), ${`\nAvbruten: ${reason}`}), "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${String(timer.id)} AND "company_id" = ${user.company_id}
      `);
      await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.timer_cancelled", metadata: { timerId: timer.id, reason } });
      return NextResponse.json({ success: true });
    }

    if (action === "timer.stop") {
      const entryId = randomUUID();
      const currentSegment = timer.status === "running" && timer.segment_started_at
        ? Math.max(0, Math.floor((Date.now() - new Date(String(timer.segment_started_at)).getTime()) / 60000)) : 0;
      const totalMinutes = Math.max(1, Number(timer.accumulated_minutes || 0) + currentSegment);
      const hourlyRate = Number(timer.hourly_rate || 0);
      const totalAmount = Math.round((totalMinutes / 60) * hourlyRate * 100) / 100;
      const description = String(body.description || timer.description || "Arbetstid").trim();

      await db.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "WorkOrderTimerSession" SET "status" = 'stopped', "accumulated_minutes" = ${totalMinutes}, "segment_started_at" = NULL, "stopped_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${String(timer.id)} AND "company_id" = ${user.company_id}
        `);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "WorkOrderExecutionEntry"
            ("id", "company_id", "work_order_id", "created_by_id", "entry_type", "description", "quantity", "unit", "unit_cost", "total_amount", "minutes", "hourly_rate", "occurred_at")
          VALUES
            (${entryId}, ${user.company_id}, ${id}, ${user.id}, 'time', ${description}, ${totalMinutes / 60}, 'tim', ${hourlyRate}, ${totalAmount}, ${totalMinutes}, ${hourlyRate}, CURRENT_TIMESTAMP)
        `);
        await syncActualCost(tx, id, user.company_id!);
      });
      await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.timer_stopped", metadata: { timerId: timer.id, entryId, totalMinutes, hourlyRate, totalAmount } });
      return NextResponse.json({ id: entryId, totalMinutes, totalAmount });
    }

    if (action === "entry.void") {
      const entryId = String(body.entryId || "");
      const reason = String(body.reason || "").trim();
      if (!entryId || !reason) return NextResponse.json({ error: "Registrering och anledning krävs" }, { status: 400 });
      const changed = await db.$transaction(async (tx) => {
        const count = await tx.$executeRaw(Prisma.sql`
          UPDATE "WorkOrderExecutionEntry" SET "is_voided" = true, "voided_at" = CURRENT_TIMESTAMP, "voided_by_id" = ${user.id}, "void_reason" = ${reason}
          WHERE "id" = ${entryId} AND "company_id" = ${user.company_id} AND "work_order_id" = ${id} AND COALESCE("is_voided", false) = false
        `);
        await syncActualCost(tx, id, user.company_id!);
        return count;
      });
      if (!changed) return NextResponse.json({ error: "Registreringen hittades inte eller är redan annullerad" }, { status: 404 });
      await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.execution_voided", metadata: { entryId, reason } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Ogiltig åtgärd" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte uppdatera teknikerflödet";
    const conflict = message.includes("unique") || message.includes("active_user");
    return NextResponse.json({ error: conflict ? "Du har redan en aktiv timer på en annan arbetsorder" : message }, { status: conflict ? 409 : 400 });
  }
}
