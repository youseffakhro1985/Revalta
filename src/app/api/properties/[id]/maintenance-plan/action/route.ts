import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const RISKS = new Set(["low", "medium", "high", "critical"]);
const STATUSES = new Set(["planned", "approved", "in_progress", "completed", "deferred", "cancelled"]);

function text(value: unknown, max = 500) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function decimal(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id: propertyId } = await params;
  const property = await db.property.findFirst({
    where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
    select: { id: true },
  });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  const body = await request.json();
  const actionId = text(body.actionId, 80);
  const title = text(body.title, 180);
  const plannedYear = integer(body.plannedYear);
  const estimatedCost = decimal(body.estimatedCost);
  const priority = String(body.priority || "normal");
  const risk = String(body.risk || "low");
  const status = String(body.status || "planned");

  if (!actionId || !title || !plannedYear || estimatedCost == null || estimatedCost < 0) {
    return NextResponse.json({ error: "Kontrollera åtgärdens namn, år och kostnad" }, { status: 400 });
  }
  if (!PRIORITIES.has(priority) || !RISKS.has(risk) || !STATUSES.has(status)) {
    return NextResponse.json({ error: "Prioritet, risk eller status är ogiltig" }, { status: 400 });
  }

  const [current] = await db.$queryRaw<Array<{
    id: string;
    maintenance_plan_id: string;
    base_year: number;
    horizon_years: number;
    title: string;
    planned_year: number;
    estimated_cost: number;
    priority: string;
    risk: string;
    status: string;
  }>>(Prisma.sql`
    SELECT a."id", a."maintenance_plan_id", p."base_year", p."horizon_years", a."title",
           a."planned_year", a."estimated_cost"::double precision AS "estimated_cost",
           a."priority", a."risk", a."status"
    FROM "MaintenanceAction" a
    JOIN "MaintenancePlan" p ON p."id" = a."maintenance_plan_id"
    WHERE a."id" = ${actionId}
      AND a."company_id" = ${user.company_id}
      AND a."property_id" = ${propertyId}
    LIMIT 1
  `);
  if (!current) return NextResponse.json({ error: "Åtgärden hittades inte" }, { status: 404 });
  if (plannedYear < current.base_year || plannedYear >= current.base_year + current.horizon_years) {
    return NextResponse.json({ error: "Året måste ligga inom planens tidshorisont" }, { status: 400 });
  }

  const completedAt = status === "completed" ? Prisma.sql`CURRENT_TIMESTAMP` : Prisma.sql`NULL`;
  await db.$executeRaw(Prisma.sql`
    UPDATE "MaintenanceAction"
    SET "title" = ${title},
        "planned_year" = ${plannedYear},
        "estimated_cost" = ${estimatedCost},
        "priority" = ${priority},
        "risk" = ${risk},
        "status" = ${status},
        "completed_at" = ${completedAt},
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${actionId}
      AND "company_id" = ${user.company_id}
      AND "property_id" = ${propertyId}
  `);

  await writeAuditLog(user, {
    entityType: "maintenance_action",
    entityId: actionId,
    action: "maintenance_action.updated",
    metadata: {
      propertyId,
      planId: current.maintenance_plan_id,
      before: {
        title: current.title,
        plannedYear: current.planned_year,
        estimatedCost: current.estimated_cost,
        priority: current.priority,
        risk: current.risk,
        status: current.status,
      },
      after: { title, plannedYear, estimatedCost, priority, risk, status },
    },
  });

  return NextResponse.json({ success: true });
}
