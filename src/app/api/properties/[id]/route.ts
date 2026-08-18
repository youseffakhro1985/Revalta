import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { OCCUPYING_LEASE_STATUSES } from "@/lib/leasing";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/properties/[id]";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function optionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function successResponse(
  observability: ReturnType<typeof createRouteObservability>,
  body: unknown,
) {
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
  observability.logger.warn("property detail request rejected", observability.elapsed({
    event: options.event,
    ...options.context,
  }));
  return apiErrorResponse({
    status: options.status,
    code: options.code,
    message: options.message,
    requestId: observability.requestId,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "properties.update.unauthorized",
      });
    }
    if (!canCreateProperties(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att redigera fastigheter",
        event: "properties.update.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        event: "properties.update.missing_company",
        context: { userId: user.id },
      });
    }

    const { id } = await params;
    const existing = await db.property.findFirst({
      where: { id, deleted_at: null, ...tenantWhere(user) },
    });
    if (!existing) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Fastigheten hittades inte",
        event: "properties.update.not_found",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ogiltigt innehåll",
        event: "properties.update.validation_failed",
        context: { reason: "invalid_body", userId: user.id, companyId: user.company_id, propertyId: existing.id },
      });
    }

    const name = optionalText(body.name);
    const address = optionalText(body.address);
    const city = optionalText(body.city);
    if (!name || !address || !city) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Namn, adress och ort krävs",
        event: "properties.update.validation_failed",
        context: { reason: "missing_required_fields", userId: user.id, companyId: user.company_id, propertyId: existing.id },
      });
    }

    const constructionYear = optionalNumber(body.constructionYear);
    const totalArea = optionalNumber(body.totalArea);
    const boa = optionalNumber(body.boa);
    const loa = optionalNumber(body.loa);
    if (constructionYear !== null && (!Number.isInteger(constructionYear) || constructionYear < 1600 || constructionYear > 2100)) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ange ett giltigt byggår",
        event: "properties.update.validation_failed",
        context: { reason: "invalid_construction_year", userId: user.id, companyId: user.company_id, propertyId: existing.id },
      });
    }

    const updateResult = await db.property.updateMany({
      where: { id, company_id: user.company_id, deleted_at: null },
      data: {
        name,
        address,
        postal_code: optionalText(body.postalCode),
        city,
        property_identifier: optionalText(body.propertyIdentifier),
        property_type: optionalText(body.propertyType) || "residential",
        status: optionalText(body.status) || "active",
        construction_year: constructionYear,
        total_area: totalArea,
        boa,
        loa,
        manager_name: optionalText(body.managerName),
        contact_name: optionalText(body.contactName),
        contact_email: optionalText(body.contactEmail),
        contact_phone: optionalText(body.contactPhone),
      },
    });
    if (updateResult.count === 0) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Fastigheten hittades inte",
        event: "properties.update.not_found_after_write",
        context: { userId: user.id, companyId: user.company_id, propertyId: existing.id },
      });
    }

    const property = await db.property.findFirst({
      where: { id, company_id: user.company_id, deleted_at: null },
    });
    if (!property) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Fastigheten hittades inte",
        event: "properties.update.not_found_after_refetch",
        context: { userId: user.id, companyId: user.company_id, propertyId: existing.id },
      });
    }

    await writeAuditLog(user, {
      entityType: "property",
      entityId: id,
      action: "property.updated",
      metadata: { name: property.name, propertyIdentifier: property.property_identifier },
    });

    observability.logger.info("property update completed", observability.elapsed({
      event: "properties.update.completed",
      userId: user.id,
      companyId: user.company_id,
      propertyId: property.id,
    }));
    return successResponse(observability, { success: true, property });
  } catch (error) {
    observability.logger.error("property update failed", error, observability.elapsed({
      event: "properties.update.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "properties.delete.unauthorized",
      });
    }
    if (!canCreateProperties(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att ta bort fastigheter",
        event: "properties.delete.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        event: "properties.delete.missing_company",
        context: { userId: user.id },
      });
    }

    const { id } = await params;
    const existing = await db.property.findFirst({
      where: { id, company_id: user.company_id, deleted_at: null },
      select: { id: true, name: true, status: true },
    });
    if (!existing) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Fastigheten hittades inte",
        event: "properties.delete.not_found",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const [openLeases, openTickets, openWorkOrders] = await Promise.all([
      db.lease.count({
        where: {
          property_id: existing.id,
          company_id: user.company_id,
          deleted_at: null,
          status: { in: [...OCCUPYING_LEASE_STATUSES] },
        },
      }),
      db.ticket.count({
        where: {
          property_id: existing.id,
          company_id: user.company_id,
          deleted_at: null,
          status: { not: "closed" },
        },
      }),
      db.workOrder.count({
        where: {
          property_id: existing.id,
          company_id: user.company_id,
          deleted_at: null,
          status: { notIn: ["closed", "cancelled", "completed", "invoiced"] },
        },
      }),
    ]);

    const conflict = (message: string, reason: string, count: number) => reject(observability, {
      status: 409,
      code: API_ERROR_CODES.conflict,
      message,
      event: "properties.delete.conflict",
      context: { reason, count, userId: user.id, companyId: user.company_id, propertyId: existing.id },
    });
    if (openLeases > 0) return conflict("Fastigheten kan inte tas bort medan det finns aktiva eller pågående hyresavtal", "active_leases", openLeases);
    if (openTickets > 0) return conflict("Fastigheten kan inte tas bort medan det finns öppna ärenden", "open_tickets", openTickets);
    if (openWorkOrders > 0) return conflict("Fastigheten kan inte tas bort medan det finns öppna arbetsordrar", "open_work_orders", openWorkOrders);

    const deleteResult = await db.property.updateMany({
      where: { id: existing.id, company_id: user.company_id, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    if (deleteResult.count === 0) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Fastigheten hittades inte",
        event: "properties.delete.not_found_after_write",
        context: { userId: user.id, companyId: user.company_id, propertyId: existing.id },
      });
    }

    await writeAuditLog(user, {
      entityType: "property",
      entityId: existing.id,
      action: "property.deleted",
      metadata: { name: existing.name, previousStatus: existing.status, softDelete: true },
    });

    observability.logger.info("property delete completed", observability.elapsed({
      event: "properties.delete.completed",
      userId: user.id,
      companyId: user.company_id,
      propertyId: existing.id,
    }));
    return successResponse(observability, { success: true });
  } catch (error) {
    observability.logger.error("property delete failed", error, observability.elapsed({
      event: "properties.delete.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
