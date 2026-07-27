import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, requireCompanyUser } from "@/lib/current-user";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";
import { createLogger } from "@/lib/structured-logger";
import { isMissingSchemaColumnError, schemaMismatchUserMessage } from "@/lib/schema-readiness";

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
    route: "/api/properties/[id]/buildings",
    method: "POST",
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      logger.warn("building creation unauthorized", {
        eventCode: "buildings.create.unauthorized",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({ status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", requestId });
    }

    const user = requireCompanyUser(currentUser);
    if (!user) {
      logger.warn("building creation denied without company scope", {
        eventCode: "buildings.create.forbidden",
        userId: currentUser.id,
        role: currentUser.role,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att skapa byggnader",
        requestId,
      });
    }

    if (!canCreateProperties(user.role)) {
      logger.warn("building creation forbidden", {
        eventCode: "buildings.create.forbidden",
        companyId: user.company_id,
        userId: user.id,
        role: user.role,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att skapa byggnader",
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
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const address = typeof body.address === "string" && body.address.trim() ? body.address.trim() : null;
    const constructionYear = body.constructionYear === "" || body.constructionYear == null ? null : Number(body.constructionYear);
    const floors = body.floors === "" || body.floors == null ? null : Number(body.floors);

    if (name.length < 2) {
      logger.info("building validation failed", {
        eventCode: "buildings.create.validation_failed",
        field: "name",
        companyId: user.company_id,
        propertyId,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Byggnadens namn måste anges",
        requestId,
      });
    }
    if (constructionYear !== null && (!Number.isInteger(constructionYear) || constructionYear < 1600 || constructionYear > 2100)) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ange ett giltigt byggår",
        requestId,
      });
    }
    if (floors !== null && (!Number.isInteger(floors) || floors < 0 || floors > 200)) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ange ett giltigt antal våningar",
        requestId,
      });
    }

    const building = await db.building.create({
      data: { property_id: propertyId, name, address, construction_year: constructionYear, floors },
    });

    await writeAuditLog(user, {
      entityType: "building",
      entityId: building.id,
      action: "building.created",
      metadata: { propertyId },
    });

    logger.info("building created", {
      eventCode: "buildings.create.succeeded",
      companyId: user.company_id,
      userId: user.id,
      propertyId,
      buildingId: building.id,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      { success: true, building, requestId },
      { status: 201, headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.warn("building creation schema unavailable", {
        eventCode: "buildings.create.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }

    logger.error("building creation failed", error, {
      eventCode: "buildings.create.failed",
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
