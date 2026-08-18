import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/properties/[id]/components/[componentId]/entries/[kind]/[entryId]";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const EVENT_TYPES = new Set(["installation", "commissioning", "service", "repair", "inspection", "warranty", "damage", "replacement", "shutdown", "restart"]);
const COST_TYPES = new Set(["service", "repair", "spare_part", "inspection", "contractor", "investment", "replacement", "other"]);
const EVENT_AUDIT_FIELDS = new Set(["work_order_id", "project_id", "event_type", "event_date", "title", "description", "provider", "result", "next_due_at", "meter_reading"]);
const COST_AUDIT_FIELDS = new Set(["work_order_id", "project_id", "cost_type", "description", "supplier", "vat_rate", "cost_date"]);

class ComponentEntryValidationError extends Error {}

function optionalText(value: unknown, max: number) {
  if (value == null || value === "") return null;
  return String(value).trim().slice(0, max) || null;
}

function requiredDate(value: unknown, label: string) {
  const parsed = new Date(String(value || ""));
  if (Number.isNaN(parsed.getTime())) throw new ComponentEntryValidationError(`${label} är ogiltigt`);
  return parsed;
}

function optionalDate(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new ComponentEntryValidationError("Datumet är ogiltigt");
  return parsed;
}

function optionalDecimal(value: unknown, min: number, max: number, label: string) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new ComponentEntryValidationError(`${label} är ogiltigt`);
  return parsed;
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
  observability.logger.warn("component entry correction rejected", observability.elapsed({ event: options.event, ...options.context }));
  return apiErrorResponse({ status: options.status, code: options.code, message: options.message, requestId: observability.requestId });
}

async function validateLink(id: unknown, table: "WorkOrder" | "Project", propertyId: string, companyId: string) {
  if (!id) return null;
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM ${Prisma.raw(`"${table}"`)}
    WHERE "id" = ${String(id)} AND "property_id" = ${propertyId} AND "company_id" = ${companyId}
    LIMIT 1
  `);
  if (!rows[0]) throw new ComponentEntryValidationError(table === "WorkOrder" ? "Arbetsordern är ogiltig" : "Projektet är ogiltigt");
  return rows[0].id;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; componentId: string; kind: string; entryId: string }> }) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, { status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", event: "components.entries.update.unauthorized" });
    }
    if (!user.company_id) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Användaren saknar organisation", event: "components.entries.update.missing_company", context: { userId: user.id } });
    }
    if (!canCreateProperties(user.role)) {
      return reject(observability, { status: 403, code: API_ERROR_CODES.forbidden, message: "Du saknar behörighet att korrigera komponenthistorik", event: "components.entries.update.forbidden", context: { userId: user.id, companyId: user.company_id } });
    }

    const { id: propertyId, componentId, kind, entryId } = await params;
    if (kind !== "event" && kind !== "cost") {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Ogiltig posttyp", event: "components.entries.update.validation_failed", context: { reason: "invalid_kind", userId: user.id, companyId: user.company_id } });
    }

    const property = await db.property.findFirst({ where: { id: propertyId, deleted_at: null, ...tenantWhere(user) }, select: { id: true } });
    if (!property) {
      return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Fastigheten hittades inte", event: "components.entries.update.property_not_found", context: { userId: user.id, companyId: user.company_id } });
    }

    const assets = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "PropertyTechnicalAsset"
      WHERE "id" = ${componentId} AND "property_id" = ${property.id} AND "company_id" = ${user.company_id}
      LIMIT 1
    `);
    if (!assets[0]) {
      return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Komponenten hittades inte", event: "components.entries.update.component_not_found", context: { userId: user.id, companyId: user.company_id, propertyId: property.id } });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Ogiltig förfrågan", event: "components.entries.update.validation_failed", context: { reason: "invalid_body", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId } });
    }

    try {
      const workOrderId = await validateLink(body.work_order_id, "WorkOrder", property.id, user.company_id);
      const projectId = await validateLink(body.project_id, "Project", property.id, user.company_id);

      if (kind === "event") {
        const eventType = String(body.event_type || "");
        const title = String(body.title || "").trim().slice(0, 180);
        if (!EVENT_TYPES.has(eventType)) throw new ComponentEntryValidationError("Ogiltig händelsetyp");
        if (title.length < 2) throw new ComponentEntryValidationError("Rubriken måste innehålla minst två tecken");
        const eventDate = requiredDate(body.event_date, "Händelsedatumet");
        const nextDueAt = optionalDate(body.next_due_at);
        const meterReading = optionalDecimal(body.meter_reading, 0, 1_000_000_000_000, "Mätarställningen");

        const existing = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "ComponentLifecycleEvent"
          WHERE "id" = ${entryId} AND "technical_asset_id" = ${componentId} AND "property_id" = ${property.id} AND "company_id" = ${user.company_id}
          LIMIT 1
        `);
        if (!existing[0]) {
          return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Händelsen hittades inte", event: "components.entries.update.entry_not_found", context: { userId: user.id, companyId: user.company_id, propertyId: property.id, componentId, kind } });
        }

        const updated = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
          UPDATE "ComponentLifecycleEvent"
          SET "event_type" = ${eventType}, "event_date" = ${eventDate}, "title" = ${title},
              "description" = ${optionalText(body.description, 4000)}, "provider" = ${optionalText(body.provider, 200)},
              "result" = ${optionalText(body.result, 2000)}, "next_due_at" = ${nextDueAt}, "meter_reading" = ${meterReading},
              "work_order_id" = ${workOrderId}, "project_id" = ${projectId}, "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${entryId} AND "technical_asset_id" = ${componentId} AND "property_id" = ${property.id} AND "company_id" = ${user.company_id}
          RETURNING *
        `);

        const nextService = await db.$queryRaw<Array<{ next_due_at: Date | null }>>(Prisma.sql`
          SELECT MIN("next_due_at") AS "next_due_at" FROM "ComponentLifecycleEvent"
          WHERE "technical_asset_id" = ${componentId} AND "company_id" = ${user.company_id}
            AND "event_type" IN ('service', 'inspection') AND "next_due_at" IS NOT NULL
        `);
        await db.$executeRaw(Prisma.sql`
          UPDATE "PropertyTechnicalAsset" SET "next_service_at" = ${nextService[0]?.next_due_at || null}, "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${componentId} AND "property_id" = ${property.id} AND "company_id" = ${user.company_id}
        `);

        const fields = Object.keys(body).filter((field) => EVENT_AUDIT_FIELDS.has(field)).sort();
        await writeAuditLog(user, { entityType: "component_lifecycle_event", entityId: entryId, action: "corrected", metadata: { propertyId: property.id, componentId, fields } });
        observability.logger.info("component lifecycle entry corrected", observability.elapsed({ event: "components.entries.update.completed", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId, kind }));
        return observability.correlate(NextResponse.json({ entry: updated[0] }, { headers: SUCCESS_HEADERS }));
      }

      const costType = String(body.cost_type || "");
      if (!COST_TYPES.has(costType)) throw new ComponentEntryValidationError("Ogiltig kostnadstyp");
      const amount = optionalDecimal(body.amount_ex_vat, 0, 1_000_000_000_000, "Beloppet");
      if (amount == null) throw new ComponentEntryValidationError("Belopp måste anges");
      const vatRate = optionalDecimal(body.vat_rate, 0, 100, "Momssatsen");
      if (vatRate == null) throw new ComponentEntryValidationError("Momssats måste anges");
      const costDate = requiredDate(body.cost_date, "Kostnadsdatumet");

      const existing = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "ComponentCostEntry"
        WHERE "id" = ${entryId} AND "technical_asset_id" = ${componentId} AND "property_id" = ${property.id} AND "company_id" = ${user.company_id}
        LIMIT 1
      `);
      if (!existing[0]) {
        return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Kostnadsposten hittades inte", event: "components.entries.update.entry_not_found", context: { userId: user.id, companyId: user.company_id, propertyId: property.id, componentId, kind } });
      }

      const updated = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "ComponentCostEntry"
        SET "cost_type" = ${costType}, "description" = ${optionalText(body.description, 2000)},
            "supplier" = ${optionalText(body.supplier, 200)}, "amount_ex_vat" = ${amount},
            "vat_rate" = ${vatRate}, "cost_date" = ${costDate}, "work_order_id" = ${workOrderId}, "project_id" = ${projectId}
        WHERE "id" = ${entryId} AND "technical_asset_id" = ${componentId} AND "property_id" = ${property.id} AND "company_id" = ${user.company_id}
        RETURNING *
      `);

      const fields = Object.keys(body).filter((field) => COST_AUDIT_FIELDS.has(field)).sort();
      await writeAuditLog(user, {
        entityType: "component_cost_entry",
        entityId: entryId,
        action: "corrected",
        metadata: { propertyId: property.id, componentId, fields, financeFieldChanged: Object.prototype.hasOwnProperty.call(body, "amount_ex_vat") },
      });
      observability.logger.info("component cost entry corrected", observability.elapsed({ event: "components.entries.update.completed", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId, kind }));
      return observability.correlate(NextResponse.json({ entry: updated[0] }, { headers: SUCCESS_HEADERS }));
    } catch (error) {
      if (error instanceof ComponentEntryValidationError) {
        return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: error.message, event: "components.entries.update.validation_failed", context: { reason: "field_validation", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId, kind } });
      }
      throw error;
    }
  } catch (error) {
    observability.logger.error("component entry correction failed", error, observability.elapsed({ event: "components.entries.update.failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}
