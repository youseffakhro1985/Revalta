import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { createRouteObservability } from "@/lib/route-observability";
import { sqlSoftDeleteGuard } from "@/lib/soft-delete-compat";

const ROUTE = "/api/properties/[id]/components/[componentId]/maintenance-settings";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

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
  observability.logger.warn("component maintenance request rejected", observability.elapsed({ event: options.event, ...options.context }));
  return apiErrorResponse({ status: options.status, code: options.code, message: options.message, requestId: observability.requestId });
}

async function resolveContext(
  params: Promise<{ id: string; componentId: string }>,
  observability: ReturnType<typeof createRouteObservability>,
  operation: "read" | "update",
) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: reject(observability, { status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", event: `components.maintenance.${operation}.unauthorized` }) };
  }
  if (!user.company_id) {
    return { error: reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Användaren saknar organisation", event: `components.maintenance.${operation}.missing_company`, context: { userId: user.id } }) };
  }
  if (operation === "update" && !canCreateProperties(user.role)) {
    return { error: reject(observability, { status: 403, code: API_ERROR_CODES.forbidden, message: "Du saknar behörighet att ändra underhållsinställningar", event: "components.maintenance.update.forbidden", context: { userId: user.id, companyId: user.company_id } }) };
  }

  const { id: propertyId, componentId } = await params;
  const property = await db.property.findFirst({ where: { id: propertyId, deleted_at: null, ...tenantWhere(user) }, select: { id: true } });
  if (!property) {
    return { error: reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Fastigheten hittades inte", event: `components.maintenance.${operation}.property_not_found`, context: { userId: user.id, companyId: user.company_id } }) };
  }

  return { user, propertyId: property.id, componentId };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; componentId: string }> }) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const context = await resolveContext(params, observability, "read");
    if ("error" in context) return context.error;
    const workOrderGuard = await sqlSoftDeleteGuard(db, "WorkOrder", "wo");
    const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT a."id", a."name", a."next_service_at", a."service_interval_months", a."service_lead_days",
             a."auto_create_service_work_orders", a."criticality", a."status",
             w."id" AS "last_service_work_order_id", w."work_order_number" AS "last_service_work_order_number",
             w."completed_at" AS "last_service_completed_at", w."maintenance_cycle_advanced_at",
             w."maintenance_cycle_key" AS "last_service_cycle_key"
      FROM "PropertyTechnicalAsset" a
      LEFT JOIN LATERAL (
        SELECT wo."id", wo."work_order_number", wo."completed_at", wo."maintenance_cycle_advanced_at", wo."maintenance_cycle_key"
        FROM "WorkOrder" wo
        WHERE wo."company_id" = a."company_id"
          AND wo."technical_asset_id" = a."id"
          AND wo."source" = 'maintenance_plan'
          AND wo."maintenance_cycle_advanced_at" IS NOT NULL
          ${workOrderGuard}
        ORDER BY wo."maintenance_cycle_advanced_at" DESC
        LIMIT 1
      ) w ON TRUE
      WHERE a."id" = ${context.componentId} AND a."property_id" = ${context.propertyId} AND a."company_id" = ${context.user.company_id}
      LIMIT 1
    `);
    if (!rows[0]) {
      return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Komponenten hittades inte", event: "components.maintenance.read.component_not_found", context: { userId: context.user.id, companyId: context.user.company_id, propertyId: context.propertyId } });
    }

    observability.logger.info("component maintenance settings read completed", observability.elapsed({ event: "components.maintenance.read.completed", userId: context.user.id, companyId: context.user.company_id, propertyId: context.propertyId, componentId: context.componentId }));
    return successResponse(observability, { settings: rows[0] });
  } catch (error) {
    observability.logger.error("component maintenance settings read failed", error, observability.elapsed({ event: "components.maintenance.read.failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; componentId: string }> }) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const context = await resolveContext(params, observability, "update");
    if ("error" in context) return context.error;

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Ogiltig förfrågan", event: "components.maintenance.update.validation_failed", context: { reason: "invalid_body", userId: context.user.id, companyId: context.user.company_id, propertyId: context.propertyId } });
    }
    const interval = Number(body.serviceIntervalMonths);
    const leadDays = Number(body.serviceLeadDays);
    const enabled = body.autoCreateServiceWorkOrders === true;
    const nextServiceAt = body.nextServiceAt ? new Date(String(body.nextServiceAt)) : null;

    if (!Number.isInteger(interval) || interval < 1 || interval > 120) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Serviceintervallet måste vara 1–120 månader", event: "components.maintenance.update.validation_failed", context: { reason: "invalid_interval", userId: context.user.id, companyId: context.user.company_id, propertyId: context.propertyId } });
    }
    if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 365) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Framförhållningen måste vara 0–365 dagar", event: "components.maintenance.update.validation_failed", context: { reason: "invalid_lead_days", userId: context.user.id, companyId: context.user.company_id, propertyId: context.propertyId } });
    }
    if (nextServiceAt && Number.isNaN(nextServiceAt.getTime())) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Ogiltigt servicedatum", event: "components.maintenance.update.validation_failed", context: { reason: "invalid_next_service_at", userId: context.user.id, companyId: context.user.company_id, propertyId: context.propertyId } });
    }

    const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      UPDATE "PropertyTechnicalAsset"
      SET "next_service_at" = ${nextServiceAt},
          "service_interval_months" = ${interval},
          "service_lead_days" = ${leadDays},
          "auto_create_service_work_orders" = ${enabled},
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${context.componentId} AND "property_id" = ${context.propertyId} AND "company_id" = ${context.user.company_id}
      RETURNING "id", "name", "next_service_at", "service_interval_months", "service_lead_days", "auto_create_service_work_orders"
    `);
    if (!rows[0]) {
      return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Komponenten hittades inte", event: "components.maintenance.update.component_not_found", context: { userId: context.user.id, companyId: context.user.company_id, propertyId: context.propertyId } });
    }

    await writeAuditLog(context.user, {
      entityType: "technical_asset",
      entityId: context.componentId,
      action: "maintenance.settings_updated",
      metadata: { propertyId: context.propertyId, serviceIntervalMonths: interval, serviceLeadDays: leadDays, autoCreateServiceWorkOrders: enabled, nextServiceAt: nextServiceAt?.toISOString() ?? null },
    });
    observability.logger.info("component maintenance settings update completed", observability.elapsed({ event: "components.maintenance.update.completed", userId: context.user.id, companyId: context.user.company_id, propertyId: context.propertyId, componentId: context.componentId }));
    return successResponse(observability, { settings: rows[0] });
  } catch (error) {
    observability.logger.error("component maintenance settings update failed", error, observability.elapsed({ event: "components.maintenance.update.failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}
