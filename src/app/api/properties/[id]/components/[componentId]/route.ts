import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, canViewFinanceData, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { createRouteObservability } from "@/lib/route-observability";
import { sqlSoftDeleteGuard } from "@/lib/soft-delete-compat";

const ROUTE = "/api/properties/[id]/components/[componentId]";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const COMPONENT_STATUSES = new Set(["active", "planned", "inactive", "replaced", "decommissioned"]);
const CRITICALITIES = new Set(["low", "normal", "high", "critical"]);

class ComponentValidationError extends Error {}

function optionalText(value: unknown, maxLength = 255) {
  if (value == null || value === "") return null;
  return String(value).trim().slice(0, maxLength) || null;
}

function optionalInteger(value: unknown, min: number, max: number) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new ComponentValidationError("Ogiltigt heltal");
  return parsed;
}

function optionalNumber(value: unknown, min: number, max: number) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new ComponentValidationError("Ogiltigt belopp");
  return parsed;
}

function optionalDate(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new ComponentValidationError("Ogiltigt datum");
  return parsed;
}

function successResponse(observability: ReturnType<typeof createRouteObservability>, body: unknown) {
  return observability.correlate(NextResponse.json(body, { headers: SUCCESS_HEADERS }));
}

function reject(
  observability: ReturnType<typeof createRouteObservability>,
  options: {
    status: number;
    code: Parameters<typeof apiErrorResponse>[0]["code"];
    message: string;
    event: string;
    context?: Record<string, unknown>;
  },
) {
  observability.logger.warn("component detail request rejected", observability.elapsed({ event: options.event, ...options.context }));
  return apiErrorResponse({ status: options.status, code: options.code, message: options.message, requestId: observability.requestId });
}

async function resolveContext(params: Promise<{ id: string; componentId: string }>) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Obehörig" }, { status: 401 }) };
  if (!user.company_id) return { error: NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 }) };

  const { id: propertyId, componentId } = await params;
  const property = await db.property.findFirst({
    where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
    select: { id: true, name: true },
  });
  if (!property) return { error: NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 }) };

  return { user, propertyId, componentId, property };
}

async function resolveMutationContext(
  params: Promise<{ id: string; componentId: string }>,
  observability: ReturnType<typeof createRouteObservability>,
) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: reject(observability, { status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", event: "components.detail.update.unauthorized" }) };
  }
  if (!user.company_id) {
    return { error: reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Användaren saknar organisation", event: "components.detail.update.missing_company", context: { userId: user.id } }) };
  }
  if (!canCreateProperties(user.role)) {
    return { error: reject(observability, { status: 403, code: API_ERROR_CODES.forbidden, message: "Du saknar behörighet att ändra tekniska komponenter", event: "components.detail.update.forbidden", context: { userId: user.id, companyId: user.company_id } }) };
  }

  const { id: propertyId, componentId } = await params;
  const property = await db.property.findFirst({
    where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
    select: { id: true },
  });
  if (!property) {
    return { error: reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Fastigheten hittades inte", event: "components.detail.update.property_not_found", context: { userId: user.id, companyId: user.company_id } }) };
  }

  return { user, propertyId: property.id, componentId };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; componentId: string }> }) {
  const context = await resolveContext(params);
  if ("error" in context) return context.error;
  const { user, propertyId, componentId, property } = context;

  const components = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT a.*, b."name" AS "building_name"
    FROM "PropertyTechnicalAsset" a
    LEFT JOIN "Building" b ON b."id" = a."building_id"
    WHERE a."id" = ${componentId} AND a."property_id" = ${propertyId} AND a."company_id" = ${user.company_id}
    LIMIT 1
  `);
  const component = components[0];
  if (!component) return NextResponse.json({ error: "Komponenten hittades inte" }, { status: 404 });

  const [workOrderGuard, projectGuard] = await Promise.all([
    sqlSoftDeleteGuard(db, "WorkOrder", "w"),
    sqlSoftDeleteGuard(db, "Project", "p"),
  ]);

  const events = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT e.*, u."name" AS "created_by_name", u."email" AS "created_by_email",
      w."title" AS "work_order_title", p."name" AS "project_name"
    FROM "ComponentLifecycleEvent" e
    JOIN "User" u ON u."id" = e."created_by_id"
    LEFT JOIN "WorkOrder" w ON w."id" = e."work_order_id" AND w."company_id" = ${user.company_id} ${workOrderGuard}
    LEFT JOIN "Project" p ON p."id" = e."project_id" AND p."company_id" = ${user.company_id} ${projectGuard}
    WHERE e."technical_asset_id" = ${componentId} AND e."property_id" = ${propertyId} AND e."company_id" = ${user.company_id}
    ORDER BY e."event_date" DESC, e."created_at" DESC
    LIMIT 200
  `);

  const costs = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT c.*, u."name" AS "created_by_name", u."email" AS "created_by_email",
      w."title" AS "work_order_title", p."name" AS "project_name"
    FROM "ComponentCostEntry" c
    JOIN "User" u ON u."id" = c."created_by_id"
    LEFT JOIN "WorkOrder" w ON w."id" = c."work_order_id" AND w."company_id" = ${user.company_id} ${workOrderGuard}
    LEFT JOIN "Project" p ON p."id" = c."project_id" AND p."company_id" = ${user.company_id} ${projectGuard}
    WHERE c."technical_asset_id" = ${componentId} AND c."property_id" = ${propertyId} AND c."company_id" = ${user.company_id}
    ORDER BY c."cost_date" DESC, c."created_at" DESC
    LIMIT 200
  `);

  const linkedWorkOrders = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT DISTINCT w."id", w."title", w."status", w."priority", w."scheduled_end", w."actual_cost", w."updated_at"
    FROM "WorkOrder" w
    JOIN "ComponentLifecycleEvent" e ON e."work_order_id" = w."id"
    WHERE e."technical_asset_id" = ${componentId} AND w."company_id" = ${user.company_id}
      ${workOrderGuard}
    ORDER BY w."updated_at" DESC
    LIMIT 50
  `);

  const linkedProjects = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT DISTINCT p."id", p."name", p."status", p."risk", p."budget", p."actual", p."end_date", p."updated_at"
    FROM "Project" p
    JOIN "ComponentLifecycleEvent" e ON e."project_id" = p."id"
    WHERE e."technical_asset_id" = ${componentId} AND p."company_id" = ${user.company_id}
      ${projectGuard}
    ORDER BY p."updated_at" DESC
    LIMIT 50
  `);

  const metrics = {
    eventCount: events.length,
    totalCostExVat: costs.reduce((sum, item) => sum + Number(item.amount_ex_vat || 0), 0),
    nextDueAt: events.map((item) => item.next_due_at).filter(Boolean).sort()[0] || component.next_service_at || null,
    linkedWorkOrders: linkedWorkOrders.length,
    linkedProjects: linkedProjects.length,
  };

  const includeFinance = canViewFinanceData(user.role);
  const safeCosts = includeFinance
    ? costs
    : costs.map((item) => ({
        ...item,
        amount_ex_vat: null,
      }));
  const safeWorkOrders = includeFinance
    ? linkedWorkOrders
    : linkedWorkOrders.map((item) => ({ ...item, actual_cost: null }));
  const safeProjects = includeFinance
    ? linkedProjects
    : linkedProjects.map((item) => ({
        ...item,
        budget: null,
        forecast: null,
        actual: null,
      }));

  return NextResponse.json({
    property,
    component: includeFinance ? component : { ...component, replacement_value: null },
    events,
    costs: safeCosts,
    linkedWorkOrders: safeWorkOrders,
    linkedProjects: safeProjects,
    metrics: includeFinance ? metrics : { ...metrics, totalCostExVat: null },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; componentId: string }> }) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const context = await resolveMutationContext(params, observability);
    if ("error" in context) return context.error;
    const { user, propertyId, componentId } = context;

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Ogiltig förfrågan", event: "components.detail.update.validation_failed", context: { reason: "invalid_body", userId: user.id, companyId: user.company_id, propertyId } });
    }

    const name = String(body.name || "").trim().slice(0, 160);
    if (name.length < 2) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Komponentnamnet måste innehålla minst två tecken", event: "components.detail.update.validation_failed", context: { reason: "invalid_name", userId: user.id, companyId: user.company_id, propertyId } });
    }

    const status = String(body.status || "active");
    const criticality = String(body.criticality || "normal");
    if (!COMPONENT_STATUSES.has(status)) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Ogiltig komponentstatus", event: "components.detail.update.validation_failed", context: { reason: "invalid_status", userId: user.id, companyId: user.company_id, propertyId } });
    }
    if (!CRITICALITIES.has(criticality)) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Ogiltig kritikalitet", event: "components.detail.update.validation_failed", context: { reason: "invalid_criticality", userId: user.id, companyId: user.company_id, propertyId } });
    }

    try {
      const installationYear = optionalInteger(body.installation_year, 1800, 2200);
      const technicalLifetime = optionalInteger(body.technical_lifetime_years, 0, 500);
      const economicLifetime = optionalInteger(body.economic_lifetime_years, 0, 500);
      const replacementYear = optionalInteger(body.expected_replacement_year, 1800, 2500);
      const conditionGrade = optionalInteger(body.condition_grade, 1, 5);
      const replacementValue = optionalNumber(body.replacement_value, 0, 1_000_000_000_000);
      const commissionedAt = optionalDate(body.commissioned_at);
      const nextServiceAt = optionalDate(body.next_service_at);

      const updated = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "PropertyTechnicalAsset"
        SET "name" = ${name},
            "category" = ${optionalText(body.category, 120)},
            "component_class" = ${optionalText(body.component_class, 120)},
            "location" = ${optionalText(body.location, 255)},
            "status" = ${status},
            "criticality" = ${criticality},
            "manufacturer" = ${optionalText(body.manufacturer, 160)},
            "model" = ${optionalText(body.model, 160)},
            "serial_number" = ${optionalText(body.serial_number, 160)},
            "installation_year" = ${installationYear},
            "commissioned_at" = ${commissionedAt},
            "technical_lifetime_years" = ${technicalLifetime},
            "economic_lifetime_years" = ${economicLifetime},
            "expected_replacement_year" = ${replacementYear},
            "condition_grade" = ${conditionGrade},
            "replacement_value" = ${replacementValue},
            "responsible_supplier" = ${optionalText(body.responsible_supplier, 200)},
            "next_service_at" = ${nextServiceAt},
            "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${componentId}
          AND "property_id" = ${propertyId}
          AND "company_id" = ${user.company_id}
        RETURNING *
      `);

      if (!updated[0]) {
        return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Komponenten hittades inte", event: "components.detail.update.component_not_found", context: { userId: user.id, companyId: user.company_id, propertyId } });
      }

      const changedFields = Object.keys(body).filter((field) => field !== "replacement_value").sort();
      await writeAuditLog(user, {
        entityType: "technical_asset",
        entityId: componentId,
        action: "updated",
        metadata: { propertyId, fields: changedFields, financeFieldChanged: Object.prototype.hasOwnProperty.call(body, "replacement_value") },
      });

      observability.logger.info("component detail update completed", observability.elapsed({ event: "components.detail.update.completed", userId: user.id, companyId: user.company_id, propertyId, componentId }));
      return successResponse(observability, { component: updated[0] });
    } catch (error) {
      if (error instanceof ComponentValidationError) {
        return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: error.message, event: "components.detail.update.validation_failed", context: { reason: "field_validation", userId: user.id, companyId: user.company_id, propertyId } });
      }
      throw error;
    }
  } catch (error) {
    observability.logger.error("component detail update failed", error, observability.elapsed({ event: "components.detail.update.failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}
