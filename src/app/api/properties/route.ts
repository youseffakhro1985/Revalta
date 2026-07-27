import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canCreateProperties, getCurrentUser, requireCompanyUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";
import {
  isMissingSchemaColumnError,
  notDeletedFilter,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";
import { createLogger } from "@/lib/structured-logger";

/** Explicit select avoids querying soft-delete columns that may not exist yet. */
const propertyListSelect = (ticketActive: { deleted_at: null } | Record<string, never>) => ({
  id: true,
  name: true,
  address: true,
  postal_code: true,
  city: true,
  property_identifier: true,
  property_type: true,
  status: true,
  created_at: true,
  updated_at: true,
  _count: {
    select: { tickets: { where: ticketActive }, buildings: true, units: true },
  },
} as const);

function successHeaders(requestId: string) {
  return {
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    [REQUEST_ID_HEADER]: requestId,
  };
}

function routeLogger(method: "GET" | "POST", requestId: string) {
  return createLogger({
    route: "/api/properties",
    method,
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = routeLogger("GET", requestId);

  try {
    const user = requireCompanyUser(await getCurrentUser());
    if (!user) {
      logger.warn("properties access denied", {
        eventCode: "properties.list.unauthorized",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        requestId,
      });
    }

    const [propertyActive, ticketActive] = await Promise.all([
      notDeletedFilter("Property"),
      notDeletedFilter("Ticket"),
    ]);
    const properties = await db.property.findMany({
      where: { ...propertyActive, company_id: user.company_id },
      orderBy: { created_at: "desc" },
      select: propertyListSelect(ticketActive),
    });

    logger.info("properties listed", {
      eventCode: "properties.list.succeeded",
      companyId: user.company_id,
      resultCount: properties.length,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        properties,
        permissions: { canCreate: canCreateProperties(user.role) },
        requestId,
      },
      { headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.error("properties schema unavailable", error, {
        eventCode: "properties.list.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }

    logger.error("properties listing failed", error, {
      eventCode: "properties.list.failed",
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

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = routeLogger("POST", requestId);

  try {
    const user = requireCompanyUser(await getCurrentUser());
    if (!user) {
      logger.warn("property creation access denied", {
        eventCode: "properties.create.unauthorized",
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
      logger.warn("property creation forbidden", {
        eventCode: "properties.create.forbidden",
        companyId: user.company_id,
        role: user.role,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att skapa fastigheter",
        requestId,
      });
    }

    const body = await request.json().catch(() => ({})) as {
      name?: unknown;
      address?: unknown;
      postalCode?: unknown;
      city?: unknown;
    };
    const normalizedName = typeof body.name === "string" ? body.name.trim() : "";
    const normalizedAddress = typeof body.address === "string" ? body.address.trim() : "";
    const normalizedPostalCode =
      typeof body.postalCode === "string" && body.postalCode.trim() ? body.postalCode.trim() : null;
    const normalizedCity = typeof body.city === "string" ? body.city.trim() : "";

    if (!normalizedName || !normalizedAddress || !normalizedCity) {
      logger.info("property creation validation failed", {
        eventCode: "properties.create.validation_failed",
        companyId: user.company_id,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Namn, adress och ort krävs",
        requestId,
      });
    }

    const ticketActive = await notDeletedFilter("Ticket");
    const property = await db.property.create({
      data: {
        name: normalizedName,
        address: normalizedAddress,
        postal_code: normalizedPostalCode,
        city: normalizedCity,
        company_id: user.company_id,
        user_id: user.id,
      },
      select: propertyListSelect(ticketActive),
    });

    await writeAuditLog(user, {
      entityType: "property",
      entityId: property.id,
      action: "property.created",
      metadata: { name: property.name, address: property.address, city: property.city },
    });

    logger.info("property created", {
      eventCode: "properties.create.succeeded",
      companyId: user.company_id,
      propertyId: property.id,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      { success: true, property, requestId },
      { status: 201, headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.error("property creation schema unavailable", error, {
        eventCode: "properties.create.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }

    logger.error("property creation failed", error, {
      eventCode: "properties.create.failed",
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
