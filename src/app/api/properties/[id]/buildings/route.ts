import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/properties/[id]/buildings";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

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
  observability.logger.warn("building create request rejected", observability.elapsed({
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
        event: "property_buildings.create.unauthorized",
      });
    }
    if (!canCreateProperties(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att skapa byggnader",
        event: "property_buildings.create.forbidden",
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
        event: "property_buildings.create.property_not_found",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ogiltigt innehåll",
        event: "property_buildings.create.validation_failed",
        context: { reason: "invalid_body", userId: user.id, companyId: user.company_id, propertyId: property.id },
      });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const address = typeof body.address === "string" && body.address.trim() ? body.address.trim() : null;
    const constructionYear = body.constructionYear === "" || body.constructionYear == null ? null : Number(body.constructionYear);
    const floors = body.floors === "" || body.floors == null ? null : Number(body.floors);

    const validationFailure = (message: string, reason: string) => reject(observability, {
      status: 400,
      code: API_ERROR_CODES.validationFailed,
      message,
      event: "property_buildings.create.validation_failed",
      context: { reason, userId: user.id, companyId: user.company_id, propertyId: property.id },
    });

    if (name.length < 2) return validationFailure("Byggnadens namn måste anges", "invalid_name");
    if (constructionYear !== null && (!Number.isInteger(constructionYear) || constructionYear < 1600 || constructionYear > 2100)) {
      return validationFailure("Ange ett giltigt byggår", "invalid_construction_year");
    }
    if (floors !== null && (!Number.isInteger(floors) || floors < 0 || floors > 200)) {
      return validationFailure("Ange ett giltigt antal våningar", "invalid_floors");
    }

    const building = await db.$transaction(async (tx) => {
      const created = await tx.building.create({
        data: { property_id: property.id, name, address, construction_year: constructionYear, floors },
      });
      await writeAuditLog(user, {
        entityType: "building",
        entityId: created.id,
        action: "building.created",
        metadata: { propertyId: property.id, name },
      }, tx);
      return created;
    });

    observability.logger.info("building create completed", observability.elapsed({
      event: "property_buildings.create.completed",
      userId: user.id,
      companyId: user.company_id,
      propertyId: property.id,
      buildingId: building.id,
    }));

    return observability.correlate(NextResponse.json({ success: true, building }, {
      status: 201,
      headers: SUCCESS_HEADERS,
    }));
  } catch (error) {
    observability.logger.error("building create failed", error, observability.elapsed({
      event: "property_buildings.create.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
