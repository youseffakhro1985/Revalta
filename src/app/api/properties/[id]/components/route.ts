import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { canViewFinanceData, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/properties/[id]/components";
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
  observability.logger.warn("component list request rejected", observability.elapsed({ event: options.event, ...options.context }));
  return apiErrorResponse({ status: options.status, code: options.code, message: options.message, requestId: observability.requestId });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, { status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", event: "components.list.unauthorized" });
    }
    if (!user.company_id) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Användaren saknar organisation", event: "components.list.missing_company", context: { userId: user.id } });
    }

    const { id: propertyId } = await params;
    const property = await db.property.findFirst({
      where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
      select: { id: true, name: true },
    });
    if (!property) {
      return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Fastigheten hittades inte", event: "components.list.property_not_found", context: { userId: user.id, companyId: user.company_id } });
    }

    const assets = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT a."id", a."name", a."category", a."component_class", a."location", a."status", a."criticality",
        a."manufacturer", a."model", a."serial_number", a."installation_year", a."commissioned_at",
        a."technical_lifetime_years", a."economic_lifetime_years", a."expected_replacement_year",
        a."condition_grade", a."replacement_value"::double precision AS "replacement_value",
        a."responsible_supplier", a."next_service_at", b."name" AS "building_name",
        COALESCE(SUM(c."amount_ex_vat"), 0)::double precision AS "lifetime_cost",
        COUNT(DISTINCT e."id")::integer AS "event_count",
        MAX(e."event_date") AS "last_event_at",
        MIN(e."next_due_at") FILTER (WHERE e."next_due_at" >= CURRENT_TIMESTAMP) AS "next_due_at"
      FROM "PropertyTechnicalAsset" a
      LEFT JOIN "Building" b ON b."id" = a."building_id"
      LEFT JOIN "ComponentLifecycleEvent" e ON e."technical_asset_id" = a."id" AND e."company_id" = ${user.company_id}
      LEFT JOIN "ComponentCostEntry" c ON c."technical_asset_id" = a."id" AND c."company_id" = ${user.company_id}
      WHERE a."company_id" = ${user.company_id} AND a."property_id" = ${property.id}
      GROUP BY a."id", b."name"
      ORDER BY COALESCE(a."expected_replacement_year", 9999), COALESCE(a."condition_grade", 1) DESC, a."name"
    `);

    const currentYear = new Date().getFullYear();
    const includeFinance = canViewFinanceData(user.role);
    const replacementValue = assets.reduce((sum, item) => sum + Number(item.replacement_value || 0), 0);
    const lifetimeCost = assets.reduce((sum, item) => sum + Number(item.lifetime_cost || 0), 0);
    const safeAssets = includeFinance
      ? assets
      : assets.map((item) => ({ ...item, replacement_value: null, lifetime_cost: null }));
    const metrics = {
      total: assets.length,
      poorCondition: assets.filter((item) => Number(item.condition_grade || 0) >= 4).length,
      replacementDue5Years: assets.filter((item) => {
        const year = Number(item.expected_replacement_year || 0);
        return year > 0 && year <= currentYear + 5;
      }).length,
      replacementValue: includeFinance ? replacementValue : null,
      lifetimeCost: includeFinance ? lifetimeCost : null,
    };

    observability.logger.info("component list completed", observability.elapsed({
      event: "components.list.completed",
      userId: user.id,
      companyId: user.company_id,
      propertyId: property.id,
      componentCount: assets.length,
      includeFinance,
    }));

    return observability.correlate(NextResponse.json({ property, assets: safeAssets, metrics, currentYear }, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("component list failed", error, observability.elapsed({ event: "components.list.failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}
