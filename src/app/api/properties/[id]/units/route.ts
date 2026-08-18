import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/properties/[id]/units";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const allowedTypes = new Set(["apartment", "commercial", "storage", "garage", "parking", "technical", "other"]);

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
  observability.logger.warn("unit create request rejected", observability.elapsed({
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "property_units.create.unauthorized",
      });
    }
    if (!canCreateProperties(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att skapa objekt",
        event: "property_units.create.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const { id } = await params;
    const property = await db.property.findFirst({
      where: { id, deleted_at: null, ...tenantWhere(user) },
      select: { id: true },
    });
    if (!property) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Fastigheten hittades inte",
        event: "property_units.create.property_not_found",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ogiltigt innehåll",
        event: "property_units.create.validation_failed",
        context: { reason: "invalid_body", userId: user.id, companyId: user.company_id, propertyId: property.id },
      });
    }

    const designation = typeof body.designation === "string" ? body.designation.trim() : "";
    const unitType = typeof body.unitType === "string" && allowedTypes.has(body.unitType) ? body.unitType : "apartment";
    const floor = typeof body.floor === "string" && body.floor.trim() ? body.floor.trim() : null;
    const area = body.area === "" || body.area == null ? null : Number(body.area);
    const rooms = body.rooms === "" || body.rooms == null ? null : Number(body.rooms);
    const buildingId = typeof body.buildingId === "string" && body.buildingId ? body.buildingId : null;

    const validationFailure = (message: string, reason: string) => reject(observability, {
      status: 400,
      code: API_ERROR_CODES.validationFailed,
      message,
      event: "property_units.create.validation_failed",
      context: { reason, userId: user.id, companyId: user.company_id, propertyId: property.id },
    });

    if (!designation) return validationFailure("Objektets beteckning måste anges", "missing_designation");
    if (area !== null && (!Number.isFinite(area) || area < 0)) return validationFailure("Ange en giltig area", "invalid_area");
    if (rooms !== null && (!Number.isFinite(rooms) || rooms < 0)) return validationFailure("Ange ett giltigt antal rum", "invalid_rooms");

    let verifiedBuildingId: string | null = null;
    if (buildingId) {
      const building = await db.building.findFirst({
        where: { id: buildingId, property_id: property.id },
        select: { id: true },
      });
      if (!building) return validationFailure("Byggnaden tillhör inte fastigheten", "building_property_mismatch");
      verifiedBuildingId = building.id;
    }

    const unit = await db.$transaction(async (tx) => {
      const created = await tx.unit.create({
        data: {
          property_id: property.id,
          building_id: verifiedBuildingId,
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
        entityId: created.id,
        action: "unit.created",
        metadata: { propertyId: property.id, designation, unitType },
      }, tx);
      return created;
    });

    observability.logger.info("unit create completed", observability.elapsed({
      event: "property_units.create.completed",
      userId: user.id,
      companyId: user.company_id,
      propertyId: property.id,
      unitId: unit.id,
      buildingId: verifiedBuildingId,
    }));

    return observability.correlate(NextResponse.json({ success: true, unit }, {
      status: 201,
      headers: SUCCESS_HEADERS,
    }));
  } catch (error) {
    observability.logger.error("unit create failed", error, observability.elapsed({
      event: "property_units.create.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
