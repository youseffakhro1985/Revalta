import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { canViewFinanceData, canViewOperations, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { createRouteObservability } from "@/lib/route-observability";

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

const ROUTE = "/api/properties/[id]/maintenance-plan";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const RISKS = new Set(["low", "medium", "high", "critical"]);
const ACTION_STATUSES = new Set(["planned", "approved", "in_progress", "completed", "deferred", "cancelled"]);
const HORIZONS = new Set([5, 10, 20, 30]);
const ROOT_WRITE_ACTIONS = new Set(["plan.create", "action.create", "plan.activate"]);

class MaintenanceWriteError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404,
    readonly code: Parameters<typeof apiErrorResponse>[0]["code"],
    readonly reason: string,
  ) {
    super(message);
  }
}

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

function rejectRequest(
  observability: ReturnType<typeof createRouteObservability>,
  options: {
    status: number;
    code: Parameters<typeof apiErrorResponse>[0]["code"];
    message: string;
    event: string;
    context?: Record<string, unknown>;
  },
) {
  observability.logger.warn("maintenance plan request rejected", observability.elapsed({ event: options.event, ...options.context }));
  return apiErrorResponse({ status: options.status, code: options.code, message: options.message, requestId: observability.requestId });
}

async function loadProperty(id: string, user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return db.property.findFirst({
    where: { id, deleted_at: null, ...tenantWhere(user) },
    select: {
      id: true,
      name: true,
      buildings: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return rejectRequest(observability, { status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", event: "maintenance_plan.read.unauthorized" });
    }
    if (!user.company_id) {
      return rejectRequest(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Användaren saknar organisation", event: "maintenance_plan.read.missing_company", context: { userId: user.id } });
    }

    const { id } = await params;
    const property = await loadProperty(id, user);
    if (!property) {
      return rejectRequest(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Fastigheten hittades inte", event: "maintenance_plan.read.property_not_found", context: { userId: user.id, companyId: user.company_id } });
    }

    const plans = await db.$queryRaw<PlanRow[]>(Prisma.sql`
      SELECT p."id", p."name", p."version", p."status", p."base_year", p."horizon_years",
             p."annual_index_rate"::double precision AS "annual_index_rate", p."summary", p."assumptions",
             p."approved_at", p."created_at"
      FROM "MaintenancePlan" p
      WHERE p."company_id" = ${user.company_id} AND p."property_id" = ${property.id}
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
        WHERE a."company_id" = ${user.company_id} AND a."property_id" = ${property.id}
          AND a."maintenance_plan_id" = ${activePlan.id}
        ORDER BY a."planned_year" ASC,
                 CASE a."priority" WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
                 a."title" ASC
      `);
    }

    const assets = await db.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
      SELECT "id", "name" FROM "PropertyTechnicalAsset"
      WHERE "company_id" = ${user.company_id} AND "property_id" = ${property.id}
      ORDER BY "name" ASC
    `);

    const includeFinance = canViewFinanceData(user.role);
    const safePlans = includeFinance
      ? plans
      : plans.map((plan) => ({ ...plan, annual_index_rate: null }));
    const safeActivePlan = !activePlan
      ? null
      : includeFinance
        ? activePlan
        : { ...activePlan, annual_index_rate: null };
    const safeActions = includeFinance
      ? actions
      : actions.map((action) => ({ ...action, estimated_cost: null, annual_index_rate: null }));

    observability.logger.info("maintenance plan read completed", observability.elapsed({ event: "maintenance_plan.read.completed", userId: user.id, companyId: user.company_id, propertyId: property.id, includeFinance }));
    return observability.correlate(NextResponse.json({
      property,
      plans: safePlans,
      activePlan: safeActivePlan,
      actions: safeActions,
      assets,
      forecast: includeFinance ? (activePlan ? calculateForecast(activePlan, actions) : null) : null,
    }, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("maintenance plan read failed", error, observability.elapsed({ event: "maintenance_plan.read.failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return rejectRequest(observability, { status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", event: "maintenance_plan.write.unauthorized" });
    }
    if (!canViewOperations(user.role)) {
      return rejectRequest(observability, { status: 403, code: API_ERROR_CODES.forbidden, message: "Du saknar behörighet", event: "maintenance_plan.write.forbidden", context: { userId: user.id, companyId: user.company_id } });
    }
    if (!user.company_id) {
      return rejectRequest(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Användaren saknar organisation", event: "maintenance_plan.write.missing_company", context: { userId: user.id } });
    }

    const { id } = await params;
    const property = await loadProperty(id, user);
    if (!property) {
      return rejectRequest(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Fastigheten hittades inte", event: "maintenance_plan.write.property_not_found", context: { userId: user.id, companyId: user.company_id } });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return rejectRequest(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Ogiltig förfrågan", event: "maintenance_plan.write.validation_failed", context: { reason: "invalid_body", userId: user.id, companyId: user.company_id, propertyId: property.id } });
    }

    const action = String(body.action || "");
    if (!ROOT_WRITE_ACTIONS.has(action)) {
      return rejectRequest(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Okänd åtgärd", event: "maintenance_plan.write.validation_failed", context: { reason: "unknown_action", userId: user.id, companyId: user.company_id, propertyId: property.id } });
    }

    try {
      if (action === "plan.create") {
        const name = text(body.name, 150);
        const baseYear = integer(body.baseYear);
        const horizonYears = integer(body.horizonYears);
        const annualIndexRate = decimal(body.annualIndexRate);
        if (!name || !baseYear || !horizonYears || !HORIZONS.has(horizonYears) || annualIndexRate == null || annualIndexRate < 0 || annualIndexRate > 25) {
          throw new MaintenanceWriteError("Kontrollera namn, basår, tidshorisont och indexering", 400, API_ERROR_CODES.validationFailed, "invalid_plan");
        }

        const planId = crypto.randomUUID();
        await db.$transaction(async (tx) => {
          const versions = await tx.$queryRaw<{ next_version: number | bigint }[]>(Prisma.sql`
            SELECT COALESCE(MAX("version"), 0) + 1 AS "next_version"
            FROM "MaintenancePlan"
            WHERE "company_id" = ${user.company_id} AND "property_id" = ${property.id}
          `);
          const nextVersion = Number(versions[0]?.next_version ?? 1);
          const affected = await tx.$executeRaw(Prisma.sql`
            INSERT INTO "MaintenancePlan" (
              "id", "company_id", "property_id", "created_by_id", "name", "version", "status",
              "base_year", "horizon_years", "annual_index_rate", "summary", "assumptions"
            ) VALUES (
              ${planId}, ${user.company_id}, ${property.id}, ${user.id}, ${name}, ${nextVersion}, 'draft',
              ${baseYear}, ${horizonYears}, ${annualIndexRate}, ${text(body.summary, 2000)}, ${text(body.assumptions, 4000)}
            )
          `);
          if (affected !== 1) throw new Error("maintenance plan insert did not affect exactly one row");
          await writeAuditLog(user, {
            entityType: "maintenance_plan",
            entityId: planId,
            action: "maintenance_plan.created",
            metadata: { propertyId: property.id, baseYear, horizonYears, indexRateConfigured: true },
          }, tx);
        });

        observability.logger.info("maintenance plan created", observability.elapsed({ event: "maintenance_plan.write.plan_created", userId: user.id, companyId: user.company_id, propertyId: property.id, planId }));
        return observability.correlate(NextResponse.json({ id: planId }, { status: 201, headers: SUCCESS_HEADERS }));
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
          throw new MaintenanceWriteError("Kontrollera åtgärdens obligatoriska uppgifter", 400, API_ERROR_CODES.validationFailed, "invalid_action");
        }

        const buildingId = text(body.buildingId, 80);
        if (buildingId && !property.buildings.some((building) => building.id === buildingId)) {
          throw new MaintenanceWriteError("Byggnaden tillhör inte fastigheten", 400, API_ERROR_CODES.validationFailed, "invalid_building");
        }

        const recurrenceYears = integer(body.recurrenceYears);
        const lifetimeYears = integer(body.technicalLifetimeYears);
        const annualIndexRate = body.annualIndexRate === "" || body.annualIndexRate == null ? null : decimal(body.annualIndexRate);
        if ((recurrenceYears != null && recurrenceYears <= 0) || (lifetimeYears != null && lifetimeYears <= 0) || (annualIndexRate != null && (annualIndexRate < 0 || annualIndexRate > 25))) {
          throw new MaintenanceWriteError("Intervall, livslängd eller indexering är ogiltig", 400, API_ERROR_CODES.validationFailed, "invalid_interval_or_index");
        }

        const technicalAssetId = text(body.technicalAssetId, 80);
        const actionId = crypto.randomUUID();
        await db.$transaction(async (tx) => {
          const plans = await tx.$queryRaw<PlanRow[]>(Prisma.sql`
            SELECT "id", "name", "version", "status", "base_year", "horizon_years",
                   "annual_index_rate"::double precision AS "annual_index_rate", "summary", "assumptions", "approved_at", "created_at"
            FROM "MaintenancePlan"
            WHERE "id" = ${planId} AND "company_id" = ${user.company_id} AND "property_id" = ${property.id}
            LIMIT 1
          `);
          const plan = plans[0];
          if (!plan) throw new MaintenanceWriteError("Underhållsplanen hittades inte", 404, API_ERROR_CODES.notFound, "plan_not_found");
          if (plannedYear < plan.base_year || plannedYear >= plan.base_year + plan.horizon_years) {
            throw new MaintenanceWriteError("Åtgärdens år måste ligga inom planens tidshorisont", 400, API_ERROR_CODES.validationFailed, "year_outside_horizon");
          }

          if (technicalAssetId) {
            const assets = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
              SELECT "id" FROM "PropertyTechnicalAsset"
              WHERE "id" = ${technicalAssetId} AND "company_id" = ${user.company_id} AND "property_id" = ${property.id}
              LIMIT 1
            `);
            if (!assets[0]) throw new MaintenanceWriteError("Installationen tillhör inte fastigheten", 400, API_ERROR_CODES.validationFailed, "invalid_asset");
          }

          const affected = await tx.$executeRaw(Prisma.sql`
            INSERT INTO "MaintenanceAction" (
              "id", "company_id", "maintenance_plan_id", "property_id", "building_id", "technical_asset_id",
              "created_by_id", "category", "title", "description", "scope", "planned_year", "recurrence_years",
              "technical_lifetime_years", "estimated_cost", "annual_index_rate", "priority", "risk", "status", "contractor"
            ) VALUES (
              ${actionId}, ${user.company_id}, ${planId}, ${property.id}, ${buildingId}, ${technicalAssetId},
              ${user.id}, ${category}, ${title}, ${text(body.description, 3000)}, ${text(body.scope, 1000)}, ${plannedYear},
              ${recurrenceYears}, ${lifetimeYears}, ${estimatedCost}, ${annualIndexRate}, ${priority}, ${risk}, ${status}, ${text(body.contractor, 180)}
            )
          `);
          if (affected !== 1) throw new Error("maintenance action insert did not affect exactly one row");
          await writeAuditLog(user, {
            entityType: "maintenance_action",
            entityId: actionId,
            action: "maintenance_action.created",
            metadata: {
              propertyId: property.id,
              planId,
              plannedYear,
              priority,
              risk,
              financeFieldRecorded: true,
              indexed: annualIndexRate != null,
            },
          }, tx);
        });

        observability.logger.info("maintenance action created", observability.elapsed({ event: "maintenance_plan.write.action_created", userId: user.id, companyId: user.company_id, propertyId: property.id, planId, actionId }));
        return observability.correlate(NextResponse.json({ id: actionId }, { status: 201, headers: SUCCESS_HEADERS }));
      }

      const planId = text(body.planId, 80);
      if (!planId) {
        throw new MaintenanceWriteError("Plan saknas", 400, API_ERROR_CODES.validationFailed, "missing_plan");
      }

      await db.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "MaintenancePlan" SET "status" = 'archived', "updated_at" = CURRENT_TIMESTAMP
          WHERE "company_id" = ${user.company_id} AND "property_id" = ${property.id} AND "status" = 'active'
        `);
        const updated = await tx.$executeRaw(Prisma.sql`
          UPDATE "MaintenancePlan" SET "status" = 'active', "approved_by_id" = ${user.id},
            "approved_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${planId} AND "company_id" = ${user.company_id} AND "property_id" = ${property.id}
        `);
        if (updated !== 1) throw new MaintenanceWriteError("Planen hittades inte", 404, API_ERROR_CODES.notFound, "plan_not_found");
        await writeAuditLog(user, {
          entityType: "maintenance_plan",
          entityId: planId,
          action: "maintenance_plan.activated",
          metadata: { propertyId: property.id },
        }, tx);
      });

      observability.logger.info("maintenance plan activated", observability.elapsed({ event: "maintenance_plan.write.plan_activated", userId: user.id, companyId: user.company_id, propertyId: property.id, planId }));
      return observability.correlate(NextResponse.json({ success: true }, { headers: SUCCESS_HEADERS }));
    } catch (error) {
      if (error instanceof MaintenanceWriteError) {
        return rejectRequest(observability, {
          status: error.status,
          code: error.code,
          message: error.message,
          event: "maintenance_plan.write.rejected",
          context: { reason: error.reason, userId: user.id, companyId: user.company_id, propertyId: property.id, action },
        });
      }
      throw error;
    }
  } catch (error) {
    observability.logger.error("maintenance plan write failed", error, observability.elapsed({ event: "maintenance_plan.write.failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}
