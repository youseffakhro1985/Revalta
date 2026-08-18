import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/properties/[id]/components/manage";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const eventTypes = new Set(["installation", "commissioning", "service", "repair", "inspection", "warranty", "damage", "replacement", "shutdown", "restart"]);
const costTypes = new Set(["service", "repair", "spare_part", "inspection", "contractor", "investment", "replacement", "other"]);
const writableRoles = new Set(["owner", "admin", "manager", "property_manager", "technical_manager"]);

class ComponentManageValidationError extends Error {}

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function optionalInteger(value: unknown, min: number, max: number) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new ComponentManageValidationError(`Värdet måste vara ett heltal mellan ${min} och ${max}`);
  return parsed;
}

function optionalNumber(value: unknown, min = 0) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) throw new ComponentManageValidationError("Beloppet måste vara ett giltigt positivt tal");
  return parsed;
}

function dateValue(value: unknown, required = false) {
  if (!value) {
    if (required) throw new ComponentManageValidationError("Datum måste anges");
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new ComponentManageValidationError("Datumet är ogiltigt");
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
  observability.logger.warn("component manage request rejected", observability.elapsed({ event: options.event, ...options.context }));
  return apiErrorResponse({ status: options.status, code: options.code, message: options.message, requestId: observability.requestId });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, { status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", event: "components.manage.unauthorized" });
    }
    if (!user.company_id) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Användaren saknar organisation", event: "components.manage.missing_company", context: { userId: user.id } });
    }
    if (!writableRoles.has(user.role)) {
      return reject(observability, { status: 403, code: API_ERROR_CODES.forbidden, message: "Du saknar behörighet att ändra komponentregistret", event: "components.manage.forbidden", context: { userId: user.id, companyId: user.company_id } });
    }

    const { id: propertyId } = await params;
    const property = await db.property.findFirst({ where: { id: propertyId, deleted_at: null, ...tenantWhere(user) }, select: { id: true } });
    if (!property) {
      return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Fastigheten hittades inte", event: "components.manage.property_not_found", context: { userId: user.id, companyId: user.company_id } });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Ogiltig förfrågan", event: "components.manage.validation_failed", context: { reason: "invalid_body", userId: user.id, companyId: user.company_id, propertyId: property.id } });
    }

    const action = String(body.action || "");
    const assetId = String(body.assetId || "");
    if (!assetId) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Välj en komponent", event: "components.manage.validation_failed", context: { reason: "missing_asset", userId: user.id, companyId: user.company_id, propertyId: property.id } });
    }

    const assets = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "PropertyTechnicalAsset"
      WHERE "id" = ${assetId} AND "property_id" = ${property.id} AND "company_id" = ${user.company_id}
      LIMIT 1
    `);
    if (!assets[0]) {
      return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Komponenten hittades inte", event: "components.manage.component_not_found", context: { userId: user.id, companyId: user.company_id, propertyId: property.id } });
    }

    try {
      if (action === "update") {
        const installationYear = optionalInteger(body.installationYear, 1800, 2300);
        const technicalLifetime = optionalInteger(body.technicalLifetimeYears, 1, 300);
        const economicLifetime = optionalInteger(body.economicLifetimeYears, 1, 300);
        const replacementYear = optionalInteger(body.expectedReplacementYear, 1800, 2300);
        const conditionGrade = optionalInteger(body.conditionGrade, 1, 5);
        const replacementValue = optionalNumber(body.replacementValue);
        const commissionedAt = dateValue(body.commissionedAt);

        await db.$executeRaw(Prisma.sql`
          UPDATE "PropertyTechnicalAsset" SET
            "component_class" = ${optionalText(body.componentClass)},
            "commissioned_at" = ${commissionedAt},
            "installation_year" = ${installationYear},
            "technical_lifetime_years" = ${technicalLifetime},
            "economic_lifetime_years" = ${economicLifetime},
            "expected_replacement_year" = ${replacementYear},
            "condition_grade" = ${conditionGrade},
            "replacement_value" = ${replacementValue},
            "responsible_supplier" = ${optionalText(body.responsibleSupplier)},
            "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${assetId} AND "property_id" = ${property.id} AND "company_id" = ${user.company_id}
        `);
        const allowedFields = [
          "commissionedAt",
          "componentClass",
          "conditionGrade",
          "economicLifetimeYears",
          "expectedReplacementYear",
          "installationYear",
          "responsibleSupplier",
          "technicalLifetimeYears",
        ].filter((field) => Object.prototype.hasOwnProperty.call(body, field));
        await db.auditLog.create({ data: {
          company_id: user.company_id,
          actor_user_id: user.id,
          entity_type: "component",
          entity_id: assetId,
          action: "component.updated",
          metadata: {
            propertyId: property.id,
            fields: allowedFields.sort(),
            financeFieldChanged: Object.prototype.hasOwnProperty.call(body, "replacementValue"),
          },
        } });
        observability.logger.info("component manage update completed", observability.elapsed({ event: "components.manage.update.completed", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId: assetId }));
        return successResponse(observability, { success: true });
      }

      if (action === "event") {
        const eventType = String(body.eventType || "");
        if (!eventTypes.has(eventType)) {
          return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Ogiltig händelsetyp", event: "components.manage.validation_failed", context: { reason: "invalid_event_type", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId: assetId } });
        }
        const title = String(body.title || "").trim();
        if (!title) {
          return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Rubrik måste anges", event: "components.manage.validation_failed", context: { reason: "missing_event_title", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId: assetId } });
        }
        const eventId = randomUUID();
        await db.$executeRaw(Prisma.sql`
          INSERT INTO "ComponentLifecycleEvent" (
            "id", "company_id", "property_id", "technical_asset_id", "created_by_id", "event_type", "event_date", "title", "description", "provider", "result", "next_due_at", "meter_reading", "updated_at"
          ) VALUES (
            ${eventId}, ${user.company_id}, ${property.id}, ${assetId}, ${user.id}, ${eventType}, ${dateValue(body.eventDate, true)}, ${title}, ${optionalText(body.description)}, ${optionalText(body.provider)}, ${optionalText(body.result)}, ${dateValue(body.nextDueAt)}, ${optionalNumber(body.meterReading)}, CURRENT_TIMESTAMP
          )
        `);
        await db.auditLog.create({ data: { company_id: user.company_id, actor_user_id: user.id, entity_type: "component_event", entity_id: eventId, action: "component.event.created", metadata: { propertyId: property.id, assetId, eventType } } });
        observability.logger.info("component manage event completed", observability.elapsed({ event: "components.manage.event.completed", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId: assetId }));
        return successResponse(observability, { success: true, id: eventId });
      }

      if (action === "cost") {
        const costType = String(body.costType || "");
        if (!costTypes.has(costType)) {
          return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Ogiltig kostnadstyp", event: "components.manage.validation_failed", context: { reason: "invalid_cost_type", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId: assetId } });
        }
        const amount = optionalNumber(body.amountExVat);
        if (amount == null) {
          return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Belopp exklusive moms måste anges", event: "components.manage.validation_failed", context: { reason: "missing_amount", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId: assetId } });
        }
        const vatRate = optionalNumber(body.vatRate) ?? 25;
        if (vatRate > 100) {
          return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Momssatsen får inte överstiga 100 procent", event: "components.manage.validation_failed", context: { reason: "invalid_vat_rate", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId: assetId } });
        }
        const costId = randomUUID();
        await db.$executeRaw(Prisma.sql`
          INSERT INTO "ComponentCostEntry" (
            "id", "company_id", "property_id", "technical_asset_id", "created_by_id", "cost_type", "description", "supplier", "amount_ex_vat", "vat_rate", "cost_date"
          ) VALUES (
            ${costId}, ${user.company_id}, ${property.id}, ${assetId}, ${user.id}, ${costType}, ${optionalText(body.description)}, ${optionalText(body.supplier)}, ${amount}, ${vatRate}, ${dateValue(body.costDate, true)}
          )
        `);
        await db.auditLog.create({ data: { company_id: user.company_id, actor_user_id: user.id, entity_type: "component_cost", entity_id: costId, action: "component.cost.created", metadata: { propertyId: property.id, assetId, costType, vatRate, amountRecorded: true } } });
        observability.logger.info("component manage cost completed", observability.elapsed({ event: "components.manage.cost.completed", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId: assetId }));
        return successResponse(observability, { success: true, id: costId });
      }

      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Ogiltig åtgärd", event: "components.manage.validation_failed", context: { reason: "invalid_action", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId: assetId } });
    } catch (error) {
      if (error instanceof ComponentManageValidationError) {
        return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: error.message, event: "components.manage.validation_failed", context: { reason: "field_validation", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId: assetId } });
      }
      throw error;
    }
  } catch (error) {
    observability.logger.error("component manage request failed", error, observability.elapsed({ event: "components.manage.failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}
