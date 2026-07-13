import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";

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
    where: { id, company_id: companyId },
    select: { id: true, title: true, status: true },
  });
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

  const [checklist, entries, summaries, slaRows] = await Promise.all([
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
      LIMIT 1
    `),
  ]);

  return NextResponse.json({
    workOrder,
    checklist,
    entries,
    summary: summaries[0] ?? { total_minutes: 0, material_cost: 0, travel_cost: 0, external_cost: 0, total_cost: 0 },
    sla: slaRows[0] ?? { response_due_at: null, completion_due_at: null, responded_at: null, sla_status: "not_set" },
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

  return NextResponse.json({ error: "Åtgärden stöds inte" }, { status: 400 });
}
