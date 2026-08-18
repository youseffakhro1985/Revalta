import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/properties/[id]/components/[componentId]/actions";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const EVENT_TYPES = new Set(["installation", "commissioning", "service", "repair", "inspection", "warranty", "damage", "replacement", "shutdown", "restart"]);
const COST_TYPES = new Set(["service", "repair", "spare_part", "inspection", "contractor", "investment", "replacement", "other"]);

class ComponentActionValidationError extends Error {}

function text(value: unknown, max = 1000) {
  if (value == null || value === "") return null;
  return String(value).trim().slice(0, max) || null;
}

function requiredText(value: unknown, label: string, max = 180) {
  const result = text(value, max);
  if (!result) throw new ComponentActionValidationError(`${label} måste anges`);
  return result;
}

function date(value: unknown, label: string, required = true) {
  if (value == null || value === "") {
    if (required) throw new ComponentActionValidationError(`${label} måste anges`);
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new ComponentActionValidationError(`${label} är ogiltigt`);
  return parsed;
}

function decimal(value: unknown, label: string, min = 0, max = 1_000_000_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new ComponentActionValidationError(`${label} är ogiltigt`);
  return parsed;
}

function successResponse(observability: ReturnType<typeof createRouteObservability>, body: unknown, status = 200) {
  return observability.correlate(NextResponse.json(body, { status, headers: SUCCESS_HEADERS }));
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
  observability.logger.warn("component action request rejected", observability.elapsed({ event: options.event, ...options.context }));
  return apiErrorResponse({ status: options.status, code: options.code, message: options.message, requestId: observability.requestId });
}

async function optionalLink(companyId: string, propertyId: string, kind: "work_order" | "project", id: unknown) {
  const value = text(id, 80);
  if (!value) return null;
  if (kind === "work_order") {
    const row = await db.workOrder.findFirst({ where: { deleted_at: null, id: value, company_id: companyId, property_id: propertyId }, select: { id: true } });
    if (!row) throw new ComponentActionValidationError("Arbetsordern hittades inte i denna fastighet");
  } else {
    const row = await db.project.findFirst({ where: { deleted_at: null, id: value, company_id: companyId, property_id: propertyId }, select: { id: true } });
    if (!row) throw new ComponentActionValidationError("Projektet hittades inte i denna fastighet");
  }
  return value;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; componentId: string }> }) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, { status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", event: "components.actions.unauthorized" });
    }
    if (!user.company_id) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Användaren saknar organisation", event: "components.actions.missing_company", context: { userId: user.id } });
    }
    if (!canCreateProperties(user.role)) {
      return reject(observability, { status: 403, code: API_ERROR_CODES.forbidden, message: "Du saknar behörighet att registrera komponenthistorik", event: "components.actions.forbidden", context: { userId: user.id, companyId: user.company_id } });
    }

    const { id: propertyId, componentId } = await params;
    const property = await db.property.findFirst({ where: { id: propertyId, deleted_at: null, ...tenantWhere(user) }, select: { id: true } });
    if (!property) {
      return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Fastigheten hittades inte", event: "components.actions.property_not_found", context: { userId: user.id, companyId: user.company_id } });
    }

    const assets = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "PropertyTechnicalAsset"
      WHERE "id" = ${componentId} AND "property_id" = ${property.id} AND "company_id" = ${user.company_id}
      LIMIT 1
    `);
    if (!assets[0]) {
      return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Komponenten hittades inte", event: "components.actions.component_not_found", context: { userId: user.id, companyId: user.company_id, propertyId: property.id } });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Ogiltig förfrågan", event: "components.actions.validation_failed", context: { reason: "invalid_body", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId } });
    }

    try {
      const action = String(body.action || "");
      const workOrderId = await optionalLink(user.company_id, property.id, "work_order", body.work_order_id);
      const projectId = await optionalLink(user.company_id, property.id, "project", body.project_id);

      if (action === "event") {
        const eventType = String(body.event_type || "");
        if (!EVENT_TYPES.has(eventType)) throw new ComponentActionValidationError("Ogiltig händelsetyp");
        const eventDate = date(body.event_date, "Händelsedatum")!;
        const nextDueAt = date(body.next_due_at, "Nästa datum", false);
        const meterReading = body.meter_reading == null || body.meter_reading === "" ? null : decimal(body.meter_reading, "Mätarställning");
        const id = crypto.randomUUID();

        const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
          INSERT INTO "ComponentLifecycleEvent"
            ("id", "company_id", "property_id", "technical_asset_id", "created_by_id", "work_order_id", "project_id", "event_type", "event_date", "title", "description", "provider", "result", "next_due_at", "meter_reading")
          VALUES
            (${id}, ${user.company_id}, ${property.id}, ${componentId}, ${user.id}, ${workOrderId}, ${projectId}, ${eventType}, ${eventDate},
             ${requiredText(body.title, "Rubrik")}, ${text(body.description, 4000)}, ${text(body.provider, 200)}, ${text(body.result, 2000)}, ${nextDueAt}, ${meterReading})
          RETURNING *
        `);

        if (nextDueAt && (eventType === "service" || eventType === "inspection")) {
          await db.$executeRaw(Prisma.sql`
            UPDATE "PropertyTechnicalAsset" SET "next_service_at" = ${nextDueAt}, "updated_at" = CURRENT_TIMESTAMP
            WHERE "id" = ${componentId} AND "company_id" = ${user.company_id}
          `);
        }

        await writeAuditLog(user, { entityType: "component_lifecycle_event", entityId: id, action: "created", metadata: { propertyId: property.id, componentId, eventType, workOrderId, projectId } });
        observability.logger.info("component event created", observability.elapsed({ event: "components.actions.event.completed", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId }));
        return successResponse(observability, { event: rows[0] }, 201);
      }

      if (action === "cost") {
        const costType = String(body.cost_type || "");
        if (!COST_TYPES.has(costType)) throw new ComponentActionValidationError("Ogiltig kostnadstyp");
        const amount = decimal(body.amount_ex_vat, "Belopp exklusive moms");
        const vatRate = decimal(body.vat_rate ?? 25, "Momssats", 0, 100);
        const costDate = date(body.cost_date, "Kostnadsdatum")!;
        const lifecycleEventId = text(body.lifecycle_event_id, 80);
        if (lifecycleEventId) {
          const linked = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "ComponentLifecycleEvent"
            WHERE "id" = ${lifecycleEventId} AND "technical_asset_id" = ${componentId} AND "company_id" = ${user.company_id}
            LIMIT 1
          `);
          if (!linked[0]) throw new ComponentActionValidationError("Den valda livscykelhändelsen hittades inte");
        }
        const id = crypto.randomUUID();
        const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
          INSERT INTO "ComponentCostEntry"
            ("id", "company_id", "property_id", "technical_asset_id", "lifecycle_event_id", "work_order_id", "project_id", "created_by_id", "cost_type", "description", "supplier", "amount_ex_vat", "vat_rate", "cost_date")
          VALUES
            (${id}, ${user.company_id}, ${property.id}, ${componentId}, ${lifecycleEventId}, ${workOrderId}, ${projectId}, ${user.id}, ${costType},
             ${text(body.description, 2000)}, ${text(body.supplier, 200)}, ${amount}, ${vatRate}, ${costDate})
          RETURNING *
        `);
        await writeAuditLog(user, { entityType: "component_cost_entry", entityId: id, action: "created", metadata: { propertyId: property.id, componentId, costType, vatRate, amountRecorded: true, workOrderId, projectId } });
        observability.logger.info("component cost created", observability.elapsed({ event: "components.actions.cost.completed", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId }));
        return successResponse(observability, { cost: rows[0] }, 201);
      }

      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Okänd åtgärd", event: "components.actions.validation_failed", context: { reason: "invalid_action", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId } });
    } catch (error) {
      if (error instanceof ComponentActionValidationError) {
        return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: error.message, event: "components.actions.validation_failed", context: { reason: "field_validation", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId } });
      }
      throw error;
    }
  } catch (error) {
    observability.logger.error("component action request failed", error, observability.elapsed({ event: "components.actions.failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}
