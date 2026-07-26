import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import {
  getModernMaterialEntry,
  getModernTimeEntry,
  upsertMaterialEntry,
  upsertTimeEntry,
} from "@/lib/work-order-ops-storage";

const entryTypes = new Set(["time", "material", "travel", "external"]);
const slaStatuses = new Set(["not_set", "on_track", "at_risk", "breached", "met"]);

type ChecklistRow = {
  id: string;
  title: string;
  description: string | null;
  is_required: boolean;
  sort_order: number;
  completed_at: Date | null;
  completed_by_id: string | null;
  created_at: Date;
};

type ExecutionRow = {
  id: string;
  entry_type: string;
  description: string;
  quantity: number;
  unit: string | null;
  unit_cost: number | null;
  total_amount: number;
  minutes: number | null;
  distance_km: number | null;
  supplier: string | null;
  occurred_at: Date;
  created_at: Date;
};

type SummaryRow = {
  total_minutes: number;
  material_cost: number;
  travel_cost: number;
  external_cost: number;
  total_cost: number;
};

type SlaRow = {
  response_due_at: Date | null;
  completion_due_at: Date | null;
  responded_at: Date | null;
  sla_status: string;
};

type CompletionRow = {
  required_incomplete: number;
  before_photos: number;
  after_photos: number;
};

function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function nonNegativeNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

async function resolveWorkOrder(id: string, companyId: string) {
  return db.workOrder.findFirst({
    where: { deleted_at: null, id, company_id: companyId },
    select: { id: true, title: true, status: true },
  });
}

async function getCompletionState(id: string, companyId: string) {
  const rows = await db.$queryRaw<CompletionRow[]>(Prisma.sql`
    SELECT
      (SELECT COUNT(*)::integer
       FROM "WorkOrderChecklistItem"
       WHERE "company_id" = ${companyId}
         AND "work_order_id" = ${id}
         AND "is_required" = true
         AND "completed_at" IS NULL) AS "required_incomplete",
      (SELECT COUNT(*)::integer
       FROM "OperationalDocument"
       WHERE "company_id" = ${companyId}
         AND "work_order_id" = ${id}
         AND "deleted_at" IS NULL
         AND "category" = 'before_photo') AS "before_photos",
      (SELECT COUNT(*)::integer
       FROM "OperationalDocument"
       WHERE "company_id" = ${companyId}
         AND "work_order_id" = ${id}
         AND "deleted_at" IS NULL
         AND "category" = 'after_photo') AS "after_photos"
  `);
  return rows[0] ?? { required_incomplete: 0, before_photos: 0, after_photos: 0 };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const workOrder = await resolveWorkOrder(id, user.company_id);
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const [checklist, entries, summaries, slaRows, completion] = await Promise.all([
    db.$queryRaw<ChecklistRow[]>(Prisma.sql`
      SELECT "id", "title", "description", "is_required", "sort_order", "completed_at", "completed_by_id", "created_at"
      FROM "WorkOrderChecklistItem"
      WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id}
      ORDER BY "sort_order" ASC, "created_at" ASC
    `),
    db.$queryRaw<ExecutionRow[]>(Prisma.sql`
      SELECT "id", "entry_type", "description",
             "quantity"::double precision AS "quantity", "unit",
             "unit_cost"::double precision AS "unit_cost",
             "total_amount"::double precision AS "total_amount",
             "minutes", "distance_km"::double precision AS "distance_km",
             "supplier", "occurred_at", "created_at"
      FROM "WorkOrderExecutionEntry"
      WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id}
      ORDER BY "occurred_at" DESC, "created_at" DESC
      LIMIT 250
    `),
    db.$queryRaw<SummaryRow[]>(Prisma.sql`
      SELECT
        COALESCE(SUM("minutes"), 0)::integer AS "total_minutes",
        COALESCE(SUM(CASE WHEN "entry_type" = 'material' THEN "total_amount" ELSE 0 END), 0)::double precision AS "material_cost",
        COALESCE(SUM(CASE WHEN "entry_type" = 'travel' THEN "total_amount" ELSE 0 END), 0)::double precision AS "travel_cost",
        COALESCE(SUM(CASE WHEN "entry_type" = 'external' THEN "total_amount" ELSE 0 END), 0)::double precision AS "external_cost",
        COALESCE(SUM("total_amount"), 0)::double precision AS "total_cost"
      FROM "WorkOrderExecutionEntry"
      WHERE "company_id" = ${user.company_id} AND "work_order_id" = ${id}
    `),
    db.$queryRaw<SlaRow[]>(Prisma.sql`
      SELECT "response_due_at", "completion_due_at", "responded_at", "sla_status"
      FROM "WorkOrder"
      WHERE "id" = ${id} AND "company_id" = ${user.company_id}
        AND "deleted_at" IS NULL
      LIMIT 1
    `),
    getCompletionState(id, user.company_id),
  ]);

  return NextResponse.json({
    workOrder,
    checklist,
    entries,
    summary: summaries[0] ?? { total_minutes: 0, material_cost: 0, travel_cost: 0, external_cost: 0, total_cost: 0 },
    sla: slaRows[0] ?? { response_due_at: null, completion_due_at: null, responded_at: null, sla_status: "not_set" },
    completion,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const workOrder = await resolveWorkOrder(id, user.company_id);
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const body = await request.json();
  const action = String(body.action || "");

  if (action === "checklist.create") {
    const title = String(body.title || "").trim();
    const description = body.description ? String(body.description).trim() : null;
    const sortOrder = Math.max(0, Math.floor(Number(body.sortOrder || 0)));
    if (!title) return NextResponse.json({ error: "Kontrollpunkten behöver en rubrik" }, { status: 400 });
    if (title.length > 240) return NextResponse.json({ error: "Rubriken är för lång" }, { status: 400 });

    const itemId = crypto.randomUUID();
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "WorkOrderChecklistItem"
        ("id", "company_id", "work_order_id", "created_by_id", "title", "description", "is_required", "sort_order")
      VALUES
        (${itemId}, ${user.company_id}, ${id}, ${user.id}, ${title}, ${description}, ${body.isRequired !== false}, ${sortOrder})
    `);

    await writeAuditLog(user, {
      entityType: "work_order",
      entityId: id,
      action: "work_order.checklist_created",
      metadata: { itemId, title, isRequired: body.isRequired !== false },
    });
    return NextResponse.json({ id: itemId }, { status: 201 });
  }

  if (action === "checklist.complete") {
    const itemId = String(body.itemId || "");
    const completed = body.completed !== false;
    if (!itemId) return NextResponse.json({ error: "Kontrollpunkt saknas" }, { status: 400 });

    const changed = await db.$executeRaw(Prisma.sql`
      UPDATE "WorkOrderChecklistItem"
      SET "completed_at" = ${completed ? new Date() : null},
          "completed_by_id" = ${completed ? user.id : null},
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${itemId} AND "company_id" = ${user.company_id} AND "work_order_id" = ${id}
    `);
    if (!changed) return NextResponse.json({ error: "Kontrollpunkten hittades inte" }, { status: 404 });

    await writeAuditLog(user, {
      entityType: "work_order",
      entityId: id,
      action: completed ? "work_order.checklist_completed" : "work_order.checklist_reopened",
      metadata: { itemId },
    });
    return NextResponse.json({ success: true });
  }

  if (action === "entry.create") {
    const entryType = String(body.entryType || "");
    const description = String(body.description || "").trim();
    if (!entryTypes.has(entryType)) return NextResponse.json({ error: "Ogiltig registreringstyp" }, { status: 400 });
    if (!description) return NextResponse.json({ error: "Beskrivning krävs" }, { status: 400 });

    const quantity = nonNegativeNumber(body.quantity, 1);
    const unitCost = nonNegativeNumber(body.unitCost, 0);
    const explicitAmount = body.totalAmount === undefined ? null : nonNegativeNumber(body.totalAmount);
    const minutes = body.minutes === undefined || body.minutes === "" ? null : nonNegativeNumber(body.minutes);
    const distanceKm = body.distanceKm === undefined || body.distanceKm === "" ? null : nonNegativeNumber(body.distanceKm);
    if ([quantity, unitCost, explicitAmount, minutes, distanceKm].some((value) => value === undefined)) {
      return NextResponse.json({ error: "Belopp, tid och mängd måste vara noll eller större" }, { status: 400 });
    }

    const totalAmount = explicitAmount ?? Number(quantity) * Number(unitCost);
    const occurredAt = optionalDate(body.occurredAt);
    if (occurredAt === undefined) return NextResponse.json({ error: "Ogiltigt datum" }, { status: 400 });

    const entryId = crypto.randomUUID();
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "WorkOrderExecutionEntry"
        ("id", "company_id", "work_order_id", "created_by_id", "entry_type", "description", "quantity", "unit", "unit_cost", "total_amount", "minutes", "distance_km", "supplier", "occurred_at")
      VALUES
        (${entryId}, ${user.company_id}, ${id}, ${user.id}, ${entryType}, ${description}, ${quantity}, ${body.unit ? String(body.unit).trim() : null}, ${unitCost}, ${totalAmount}, ${minutes === null ? null : Math.floor(Number(minutes))}, ${distanceKm}, ${body.supplier ? String(body.supplier).trim() : null}, ${occurredAt ?? new Date()})
    `);

    await writeAuditLog(user, {
      entityType: "work_order",
      entityId: id,
      action: `work_order.${entryType}_registered`,
      metadata: { entryId, description, totalAmount, minutes, distanceKm },
    });
    return NextResponse.json({ id: entryId }, { status: 201 });
  }

  if (action === "sla.update") {
    const responseDueAt = optionalDate(body.responseDueAt);
    const completionDueAt = optionalDate(body.completionDueAt);
    const respondedAt = optionalDate(body.respondedAt);
    const slaStatus = String(body.slaStatus || "not_set");
    if ([responseDueAt, completionDueAt, respondedAt].includes(undefined)) {
      return NextResponse.json({ error: "Ett SLA-datum är ogiltigt" }, { status: 400 });
    }
    if (!slaStatuses.has(slaStatus)) return NextResponse.json({ error: "Ogiltig SLA-status" }, { status: 400 });
    if (responseDueAt && completionDueAt && completionDueAt < responseDueAt) {
      return NextResponse.json({ error: "Sluttiden kan inte ligga före svarstiden" }, { status: 400 });
    }

    await db.$executeRaw(Prisma.sql`
      UPDATE "WorkOrder"
      SET "response_due_at" = ${responseDueAt},
          "completion_due_at" = ${completionDueAt},
          "responded_at" = ${respondedAt},
          "sla_status" = ${slaStatus},
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${id} AND "company_id" = ${user.company_id}
    `);

    await writeAuditLog(user, {
      entityType: "work_order",
      entityId: id,
      action: "work_order.sla_updated",
      metadata: { responseDueAt, completionDueAt, respondedAt, slaStatus },
    });
    return NextResponse.json({ success: true });
  }

  if (action === "completion.finalize") {
    if (workOrder.status === "completed") {
      return NextResponse.json({ error: "Arbetsordern är redan slutförd" }, { status: 409 });
    }

    const completion = await getCompletionState(id, user.company_id);
    if (completion.required_incomplete > 0) {
      return NextResponse.json({ error: `${completion.required_incomplete} obligatoriska kontrollpunkter återstår` }, { status: 400 });
    }
    if (completion.after_photos < 1) {
      return NextResponse.json({ error: "Ladda upp minst en efterbild innan arbetsordern slutförs" }, { status: 400 });
    }

    const companyId = user.company_id;
    const totals = await db.$queryRaw<{ total_cost: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM("total_amount"), 0)::double precision AS "total_cost"
      FROM "WorkOrderExecutionEntry"
      WHERE "company_id" = ${companyId} AND "work_order_id" = ${id}
    `);
    const actualCost = totals[0]?.total_cost ?? 0;
    const completedAt = new Date();
    const slaRows = await db.$queryRaw<{ completion_due_at: Date | null }[]>(Prisma.sql`
      SELECT "completion_due_at"
      FROM "WorkOrder"
      WHERE "id" = ${id} AND "company_id" = ${companyId}
        AND "deleted_at" IS NULL
      LIMIT 1
    `);
    const completionDueAt = slaRows[0]?.completion_due_at ?? null;
    const finalSlaStatus = completionDueAt && completedAt > completionDueAt ? "breached" : completionDueAt ? "met" : "not_set";

    // Promote field execution time/material into attestable billable rows (idempotent by execution entry id).
    const executionEntries = await db.$queryRaw<Array<{
      id: string;
      entry_type: string;
      description: string;
      quantity: number;
      unit: string | null;
      unit_cost: number | null;
      total_amount: number;
      minutes: number | null;
      supplier: string | null;
      occurred_at: Date;
    }>>(Prisma.sql`
      SELECT "id", "entry_type", "description",
             "quantity"::double precision AS "quantity",
             "unit",
             "unit_cost"::double precision AS "unit_cost",
             "total_amount"::double precision AS "total_amount",
             "minutes",
             "supplier",
             "occurred_at"
      FROM "WorkOrderExecutionEntry"
      WHERE "company_id" = ${companyId} AND "work_order_id" = ${id}
      ORDER BY "occurred_at" ASC, "created_at" ASC
    `);

    let promotedTime = 0;
    let promotedMaterial = 0;
    for (const entry of executionEntries) {
      if (entry.entry_type === "time" || entry.entry_type === "travel") {
        const existing = await getModernTimeEntry(companyId, id, entry.id);
        if (existing) continue;
        const minutes = Math.max(1, Math.floor(Number(entry.minutes || 0)) || Math.max(1, Math.round((Number(entry.quantity) || 0) * 60)));
        const endedAt = entry.occurred_at.toISOString();
        const startedAt = new Date(entry.occurred_at.getTime() - minutes * 60_000).toISOString();
        await upsertTimeEntry(companyId, {
          entryId: entry.id,
          workOrderId: id,
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          kind: entry.entry_type === "travel" ? "travel" : "work",
          action: "manual",
          startedAt,
          endedAt,
          minutes,
          billable: true,
          note: entry.description.slice(0, 1000),
          status: "submitted",
          actorId: user.id,
        });
        promotedTime += 1;
      } else if (entry.entry_type === "material" || entry.entry_type === "external") {
        const existing = await getModernMaterialEntry(companyId, id, entry.id);
        if (existing) continue;
        const quantity = Math.max(0.01, Number(entry.quantity) || 1);
        const unitPrice = Number(entry.unit_cost ?? 0);
        const total = Number(entry.total_amount ?? quantity * unitPrice);
        await upsertMaterialEntry(companyId, {
          entryId: entry.id,
          workOrderId: id,
          name: entry.description.slice(0, 200) || (entry.entry_type === "external" ? "Extern kostnad" : "Material"),
          quantity,
          unit: (entry.unit || "st").slice(0, 30),
          unitPrice,
          total: Math.round(total * 100) / 100,
          supplier: entry.supplier,
          stockStatus: "used",
          billable: true,
          note: entry.entry_type === "external" ? "Promoted från fältregistrering (extern)" : "Promoted från fältregistrering",
          status: "submitted",
          createdById: user.id,
          createdByName: user.name,
          createdByEmail: user.email,
          actorId: user.id,
        });
        promotedMaterial += 1;
      }
    }

    await db.$executeRaw(Prisma.sql`
      UPDATE "WorkOrder"
      SET "status" = 'completed',
          "completed_at" = ${completedAt},
          "actual_cost" = ${actualCost},
          "sla_status" = ${finalSlaStatus},
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${id} AND "company_id" = ${companyId}
    `);

    await writeAuditLog(user, {
      entityType: "work_order",
      entityId: id,
      action: "work_order.completed",
      metadata: {
        actualCost,
        slaStatus: finalSlaStatus,
        beforePhotos: completion.before_photos,
        afterPhotos: completion.after_photos,
        promotedTime,
        promotedMaterial,
        storage: "WorkOrderExecutionEntry+WorkOrderTimeEntry+WorkOrderMaterialEntry",
      },
    });

    return NextResponse.json({
      success: true,
      actualCost,
      slaStatus: finalSlaStatus,
      promoted: { time: promotedTime, material: promotedMaterial },
    });
  }

  return NextResponse.json({ error: "Åtgärden stöds inte" }, { status: 400 });
}
