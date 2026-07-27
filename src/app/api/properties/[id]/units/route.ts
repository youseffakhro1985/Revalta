import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, requireCompanyUser } from "@/lib/current-user";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";
import { createLogger } from "@/lib/structured-logger";
import { isMissingSchemaColumnError, schemaMismatchUserMessage } from "@/lib/schema-readiness";

const allowedTypes = new Set(["apartment", "commercial", "storage", "garage", "parking", "technical", "other"]);

function successHeaders(requestId: string) {
  return {
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    [REQUEST_ID_HEADER]: requestId,
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = createLogger({
    route: "/api/properties/[id]/units",
    method: "POST",
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      logger.warn("unit creation unauthorized", {
        eventCode: "units.create.unauthorized",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({ status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", requestId });
    }

    const user = requireCompanyUser(currentUser);
    if (!user || !canCreateProperties(user.role)) {
      logger.warn("unit creation forbidden", {
        eventCode: "units.create.forbidden",
        userId: currentUser.id,
        companyId: currentUser.company_id ?? undefined,
        role: currentUser.role,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att skapa objekt",
        requestId,
      });
    }

    const { id: propertyId } = await params;
    const property = await db.property.findFirst({
      where: { id: propertyId, company_id: user.company_id, deleted_at: null },
      select: { id: true },
    });
    if (!property) {
      return apiErrorResponse({
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Fastigheten hittades inte",
        requestId,
      });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const designation = typeof body.designation === "string" ? body.designation.trim() : "";
    const requestedType = typeof body.unitType === "string" ? body.unitType : "apartment";
    const unitType = allowedTypes.has(requestedType) ? requestedType : "apartment";
    const floor = typeof body.floor === "string" && body.floor.trim() ? body.floor.trim() : null;
    const area = body.area === "" || body.area == null ? null : Number(body.area);
    const rooms = body.rooms === "" || body.rooms == null ? null : Number(body.rooms);
    const buildingId = typeof body.buildingId === "string" && body.buildingId.trim() ? body.buildingId.trim() : null;

    if (!designation) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Objektets beteckning måste anges",
        requestId,
      });
    }
    if (area !== null && (!Number.isFinite(area) || area < 0)) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ange en giltig area",
        requestId,
      });
    }
    if (rooms !== null && (!Number.isFinite(rooms) || rooms < 0)) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ange ett giltigt antal rum",
        requestId,
      });
    }

    if (buildingId) {
      const building = await db.building.findFirst({
        where: {
          id: buildingId,
          property_id: propertyId,
          property: { company_id: user.company_id, deleted_at: null },
        },
        select: { id: true },
      });
      if (!building) {
        logger.info("unit building validation failed", {
          eventCode: "units.create.validation_failed",
          field: "buildingId",
          companyId: user.company_id,
          propertyId,
          latencyMs: Date.now() - startedAt,
        });
        return apiErrorResponse({
          status: 400,
          code: API_ERROR_CODES.validationFailed,
          message: "Byggnaden tillhör inte fastigheten",
          requestId,
        });
      }
    }

    const unit = await db.unit.create({
      data: {
        property_id: propertyId,
        building_id: buildingId,
        designation,
        unit_type: unitType,
        floor,
        area,
        rooms,
      },
      include: { building: { select: { name: true } } },
    });

    await writeAuditLog(user, {
      entityType: "unit",
      entityId: unit.id,
      action: "unit.created",
      metadata: { propertyId, buildingId, unitType },
    });

    logger.info("unit created", {
      eventCode: "units.create.succeeded",
      companyId: user.company_id,
      userId: user.id,
      propertyId,
      buildingId: buildingId ?? undefined,
      unitId: unit.id,
      unitType,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      { success: true, unit, requestId },
      { status: 201, headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.warn("unit creation schema unavailable", {
        eventCode: "units.create.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }

    logger.error("unit creation failed", error, {
      eventCode: "units.create.failed",
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
