import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

type PlanRow = {
  id: string;
  name: string;
  version: number;
  status: string;
  base_year: number;
  horizon_years: number;
  annual_index_rate: number;
  summary: string | null;
  assumptions: string | null;
  approved_at: string | null;
  created_at: string;
};

type ActionRow = {
  id: string;
  maintenance_plan_id: string;
  category: string;
  title: string;
  description: string | null;
  scope: string | null;
  planned_year: number;
  recurrence_years: number | null;
  technical_lifetime_years: number | null;
  estimated_cost: number;
  annual_index_rate: number | null;
  priority: string;
  risk: string;
  status: string;
  contractor: string | null;
  building_name: string | null;
  technical_asset_name: string | null;
};

const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const RISKS = new Set(["low", "medium", "high", "critical"]);
const ACTION_STATUSES = new Set(["planned", "approved", "in_progress", "completed", "deferred", "cancelled"]);
const HORIZONS = new Set([5, 10, 20, 30]);

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

function indexedCost(action: ActionRow, plan: PlanRow, targetYear: number) {
  const years = Math.max(0, targetYear - plan.base_year);
  const rate = Number(action.annual_index_rate ?? plan.annual_index_rate) / 100;
  return Number(action.estimated_cost) * Math.pow(1 + rate, years);
}

function expandOccurrences(action: ActionRow, plan: PlanRow) {
  const endYear = plan.base_year + plan.horizon_years - 1;
  const years: number[] = [];
  let year = action.planned_year;
  while (year <= endYear) {
    if (year >= plan.base_year) years.push(year);
    if (!action.recurrence_years) break;
    year += action.recurrence_years;
  }
  return years;
}

function calculateForecast(plan: PlanRow, actions: ActionRow[]) {
  const yearly = new Map<number, number>();
  for (const action of actions) {
    if (["cancelled", "completed"].includes(action.status)) continue;
    for (const year of expandOccurrences(action, plan)) {
      yearly.set(year, (yearly.get(year) || 0) + indexedCost(action, plan, year));
    }
  }

  const totals = [5, 10, 20, 30].reduce<Record<string, number>>((result, years) => {
    const end = plan.base_year + years - 1;
    result[String(years)] = [...yearly.entries()].filter(([year]) => year <= end).reduce((sum, [, amount]) => sum + amount, 0);
    return result;
  }, {});

  return {
    totals,
    yearly: [...yearly.entries()].sort(([a], [b]) => a - b).map(([year, amount]) => ({ year, amount })),
    urgent: actions.filter((item) => item.priority === "urgent" || item.risk === "critical").length,
    overdue: actions.filter((item) => item.planned_year < new Date().getFullYear() && !["completed", "cancelled"].includes(item.status)).length,
  };
}

async function loadProperty(companyId: string, id: string, user: Awaited<ReturnType<typeof getCurrentUser>>) {
  return db.property.findFirst({
    where: { id, ...tenantWhere(user!) },
    select: {
      id: true,
      name: true,
      buildings: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const property = await loadProperty(user.company_id, id, user);
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  const plans = await db.$queryRaw<PlanRow[]>(Prisma.sql`
    SELECT p."id", p."name", p."version", p."status", p."base_year", p."horizon_years",
           p."annual_index_rate"::double precision AS "annual_index_rate", p."summary", p."assumptions",
           p."approved_at", p."created_at"
    FROM "MaintenancePlan" p
    WHERE p."company_id" = ${user.company_id} AND p."property_id" = ${id}
    ORDER BY CASE p."status" WHEN 'active' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END, p."version" DESC
  `);

  const activePlan = plans.find((plan) => plan.status === "active") || plans[0] || null;
  let actions: ActionRow[] = [];
  if (activePlan) {
    actions = await db.$queryRaw<ActionRow[]>(Prisma.sql`
      SELECT a."id", a."maintenance_plan_id", a."category", a."title", a."description", a."scope",
             a."planned_year", a."recurrence_years", a."technical_lifetime_years",
             a."estimated_cost"::double precision AS "estimated_cost",
             a."annual_index_rate"::double precision AS "annual_index_rate", a."priority", a."risk",
             a."status", a."contractor", b."name" AS "building_name", t."name" AS "technical_asset_name"
      FROM "MaintenanceAction" a
      LEFT JOIN "Building" b ON b."id" = a."building_id"
      LEFT JOIN "PropertyTechnicalAsset" t ON t."id" = a."technical_asset_id"
      WHERE a."company_id" = ${user.company_id} AND a."property_id" = ${id}
        AND a."maintenance_plan_id" = ${activePlan.id}
      ORDER BY a."planned_year" ASC,
               CASE a."priority" WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
               a."title" ASC
    `);
  }

  const assets = await db.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
    SELECT "id", "name" FROM "PropertyTechnicalAsset"
    WHERE "company_id" = ${user.company_id} AND "property_id" = ${id}
    ORDER BY "name" ASC
  `);

  return NextResponse.json({
    property,
    plans,
    activePlan,
    actions,
    assets,
    forecast: activePlan ? calculateForecast(activePlan, actions) : null,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const property = await loadProperty(user.company_id, id, user);
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  const body = await request.json();
  const action = String(body.action || "");

  if (action === "plan.create") {
    const name = text(body.name, 150);
    const baseYear = integer(body.baseYear);
    const horizonYears = integer(body.horizonYears);
    const annualIndexRate = decimal(body.annualIndexRate);
    if (!name || !baseYear || !horizonYears || !HORIZONS.has(horizonYears) || annualIndexRate == null || annualIndexRate < 0 || annualIndexRate > 25) {
      return NextResponse.json({ error: "Kontrollera namn, basår, tidshorisont och indexering" }, { status: 400 });
    }

    const [{ next_version }] = await db.$queryRaw<{ next_version: number }[]>(Prisma.sql`
      SELECT COALESCE(MAX("version"), 0) + 1 AS "next_version"
      FROM "MaintenancePlan" WHERE "property_id" = ${id}
    `);
    const planId = crypto.randomUUID();
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "MaintenancePlan" (
        "id", "company_id", "property_id", "created_by_id", "name", "version", "status",
        "base_year", "horizon_years", "annual_index_rate", "summary", "assumptions"
      ) VALUES (
        ${planId}, ${user.company_id}, ${id}, ${user.id}, ${name}, ${next_version}, 'draft',
        ${baseYear}, ${horizonYears}, ${annualIndexRate}, ${text(body.summary, 2000)}, ${text(body.assumptions, 4000)}
      )
    `);
    await writeAuditLog(user, { entityType: "maintenance_plan", entityId: planId, action: "maintenance_plan.created", metadata: { propertyId: id, name, baseYear, horizonYears } });
    return NextResponse.json({ id: planId }, { status: 201 });
  }

  if (action === "action.create") {
    const planId = text(body.planId, 80);
    const title = text(body.title, 180);
    const category = text(body.category, 80);
    const plannedYear = integer(body.plannedYear);
    const estimatedCost = decimal(body.estimatedCost);
    const priority = String(body.priority || "normal");
    const risk = String(body.risk || "low");
    const status = String(body.status || "planned");
    if (!planId || !title || !category || !plannedYear || estimatedCost == null || estimatedCost < 0 || !PRIORITIES.has(priority) || !RISKS.has(risk) || !ACTION_STATUSES.has(status)) {
      return NextResponse.json({ error: "Kontrollera åtgärdens obligatoriska uppgifter" }, { status: 400 });
    }

    const [plan] = await db.$queryRaw<PlanRow[]>(Prisma.sql`
      SELECT "id", "name", "version", "status", "base_year", "horizon_years",
             "annual_index_rate"::double precision AS "annual_index_rate", "summary", "assumptions", "approved_at", "created_at"
      FROM "MaintenancePlan"
      WHERE "id" = ${planId} AND "company_id" = ${user.company_id} AND "property_id" = ${id}
      LIMIT 1
    `);
    if (!plan) return NextResponse.json({ error: "Underhållsplanen hittades inte" }, { status: 404 });
    if (plannedYear < plan.base_year || plannedYear >= plan.base_year + plan.horizon_years) {
      return NextResponse.json({ error: "Åtgärdens år måste ligga inom planens tidshorisont" }, { status: 400 });
    }

    const buildingId = text(body.buildingId, 80);
    if (buildingId && !property.buildings.some((building) => building.id === buildingId)) {
      return NextResponse.json({ error: "Byggnaden tillhör inte fastigheten" }, { status: 400 });
    }

    const technicalAssetId = text(body.technicalAssetId, 80);
    if (technicalAssetId) {
      const [asset] = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "PropertyTechnicalAsset"
        WHERE "id" = ${technicalAssetId} AND "company_id" = ${user.company_id} AND "property_id" = ${id}
      `);
      if (!asset) return NextResponse.json({ error: "Installationen tillhör inte fastigheten" }, { status: 400 });
    }

    const recurrenceYears = integer(body.recurrenceYears);
    const lifetimeYears = integer(body.technicalLifetimeYears);
    const annualIndexRate = body.annualIndexRate === "" || body.annualIndexRate == null ? null : decimal(body.annualIndexRate);
    if ((recurrenceYears != null && recurrenceYears <= 0) || (lifetimeYears != null && lifetimeYears <= 0) || (annualIndexRate != null && (annualIndexRate < 0 || annualIndexRate > 25))) {
      return NextResponse.json({ error: "Intervall, livslängd eller indexering är ogiltig" }, { status: 400 });
    }

    const actionId = crypto.randomUUID();
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "MaintenanceAction" (
        "id", "company_id", "maintenance_plan_id", "property_id", "building_id", "technical_asset_id",
        "created_by_id", "category", "title", "description", "scope", "planned_year", "recurrence_years",
        "technical_lifetime_years", "estimated_cost", "annual_index_rate", "priority", "risk", "status", "contractor"
      ) VALUES (
        ${actionId}, ${user.company_id}, ${planId}, ${id}, ${buildingId}, ${technicalAssetId},
        ${user.id}, ${category}, ${title}, ${text(body.description, 3000)}, ${text(body.scope, 1000)}, ${plannedYear},
        ${recurrenceYears}, ${lifetimeYears}, ${estimatedCost}, ${annualIndexRate}, ${priority}, ${risk}, ${status}, ${text(body.contractor, 180)}
      )
    `);
    await writeAuditLog(user, { entityType: "maintenance_action", entityId: actionId, action: "maintenance_action.created", metadata: { propertyId: id, planId, title, plannedYear, estimatedCost, priority, risk } });
    return NextResponse.json({ id: actionId }, { status: 201 });
  }

  if (action === "plan.activate") {
    const planId = text(body.planId, 80);
    if (!planId) return NextResponse.json({ error: "Plan saknas" }, { status: 400 });
    const updated = await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "MaintenancePlan" SET "status" = 'archived', "updated_at" = CURRENT_TIMESTAMP
        WHERE "company_id" = ${user.company_id} AND "property_id" = ${id} AND "status" = 'active'
      `);
      return tx.$executeRaw(Prisma.sql`
        UPDATE "MaintenancePlan" SET "status" = 'active', "approved_by_id" = ${user.id},
          "approved_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${planId} AND "company_id" = ${user.company_id} AND "property_id" = ${id}
      `);
    });
    if (!updated) return NextResponse.json({ error: "Planen hittades inte" }, { status: 404 });
    await writeAuditLog(user, { entityType: "maintenance_plan", entityId: planId, action: "maintenance_plan.activated", metadata: { propertyId: id } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Okänd åtgärd" }, { status: 400 });
}
