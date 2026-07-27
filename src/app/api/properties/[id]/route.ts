import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { canCreateProperties, getCurrentUser, requireCompanyUser } from "@/lib/current-user";
import { OCCUPYING_LEASE_STATUSES } from "@/lib/leasing";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";
import { isMissingSchemaColumnError, schemaMismatchUserMessage } from "@/lib/schema-readiness";
import { createLogger } from "@/lib/structured-logger";

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

function successHeaders(requestId: string) {
  return {
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    [REQUEST_ID_HEADER]: requestId,
  };
}

function routeLogger(method: "PATCH" | "DELETE", requestId: string) {
  return createLogger({
    route: "/api/properties/[id]",
    method,
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = routeLogger("PATCH", requestId);

  try {
    const user = requireCompanyUser(await getCurrentUser());
    if (!user) {
      logger.warn("property update unauthorized", {
        eventCode: "properties.update.unauthorized",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        requestId,
      });
    }
    if (!canCreateProperties(user.role)) {
      logger.warn("property update forbidden", {
        eventCode: "properties.update.forbidden",
        companyId: user.company_id,
        role: user.role,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att redigera fastigheter",
        requestId,
      });
    }

    const { id } = await params;
    const existing = await db.property.findFirst({
      where: { id, company_id: user.company_id, deleted_at: null },
      select: { id: true },
    });
    if (!existing) {
      return apiErrorResponse({
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Fastigheten hittades inte",
        requestId,
      });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const name = optionalText(body.name);
    const address = optionalText(body.address);
    const city = optionalText(body.city);
    if (!name || !address || !city) {
      logger.info("property update validation failed", {
        eventCode: "properties.update.validation_failed",
        companyId: user.company_id,
        propertyId: id,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Namn, adress och ort krävs",
        requestId,
      });
    }

    const constructionYear = optionalNumber(body.constructionYear);
    const totalArea = optionalNumber(body.totalArea);
    const boa = optionalNumber(body.boa);
    const loa = optionalNumber(body.loa);

    if (constructionYear !== null && (!Number.isInteger(constructionYear) || constructionYear < 1600 || constructionYear > 2100)) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ange ett giltigt byggår",
        requestId,
      });
    }
    if ([totalArea, boa, loa].some((value) => value !== null && value < 0)) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ytor kan inte vara negativa",
        requestId,
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
      return apiErrorResponse({
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Fastigheten hittades inte",
        requestId,
      });
    }

    const property = await db.property.findFirst({
      where: { id, company_id: user.company_id, deleted_at: null },
    });
    if (!property) {
      return apiErrorResponse({
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Fastigheten hittades inte",
        requestId,
      });
    }

    await writeAuditLog(user, {
      entityType: "property",
      entityId: id,
      action: "property.updated",
      metadata: { propertyIdentifier: property.property_identifier },
    });

    logger.info("property updated", {
      eventCode: "properties.update.succeeded",
      companyId: user.company_id,
      propertyId: id,
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { success: true, property, requestId },
      { headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.warn("property update schema unavailable", {
        eventCode: "properties.update.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }
    logger.error("property update failed", error, {
      eventCode: "properties.update.failed",
      latencyMs: Date.now() - startedAt,
    });
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId,
    });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = routeLogger("DELETE", requestId);

  try {
    const user = requireCompanyUser(await getCurrentUser());
    if (!user) {
      logger.warn("property delete unauthorized", {
        eventCode: "properties.delete.unauthorized",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        requestId,
      });
    }
    if (!canCreateProperties(user.role)) {
      logger.warn("property delete forbidden", {
        eventCode: "properties.delete.forbidden",
        companyId: user.company_id,
        role: user.role,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att ta bort fastigheter",
        requestId,
      });
    }

    const { id } = await params;
    const existing = await db.property.findFirst({
      where: { id, company_id: user.company_id, deleted_at: null },
      select: { id: true, status: true },
    });
    if (!existing) {
      return apiErrorResponse({
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Fastigheten hittades inte",
        requestId,
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

    const conflictMessage = openLeases > 0
      ? "Fastigheten kan inte tas bort medan det finns aktiva eller pågående hyresavtal"
      : openTickets > 0
        ? "Fastigheten kan inte tas bort medan det finns öppna ärenden"
        : openWorkOrders > 0
          ? "Fastigheten kan inte tas bort medan det finns öppna arbetsordrar"
          : null;
    if (conflictMessage) {
      logger.info("property delete blocked", {
        eventCode: "properties.delete.conflict",
        companyId: user.company_id,
        propertyId: id,
        hasOpenLeases: openLeases > 0,
        hasOpenTickets: openTickets > 0,
        hasOpenWorkOrders: openWorkOrders > 0,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 409,
        code: API_ERROR_CODES.conflict,
        message: conflictMessage,
        requestId,
      });
    }

    const deleteResult = await db.property.updateMany({
      where: { id: existing.id, company_id: user.company_id, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    if (deleteResult.count === 0) {
      return apiErrorResponse({
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Fastigheten hittades inte",
        requestId,
      });
    }

    await writeAuditLog(user, {
      entityType: "property",
      entityId: existing.id,
      action: "property.deleted",
      metadata: { previousStatus: existing.status, softDelete: true },
    });

    logger.info("property deleted", {
      eventCode: "properties.delete.succeeded",
      companyId: user.company_id,
      propertyId: id,
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { success: true, requestId },
      { headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.warn("property delete schema unavailable", {
        eventCode: "properties.delete.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }
    logger.error("property delete failed", error, {
      eventCode: "properties.delete.failed",
      latencyMs: Date.now() - startedAt,
    });
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId,
    });
  }
}
