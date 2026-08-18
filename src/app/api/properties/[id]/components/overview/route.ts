import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { canViewFinanceData, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { createRouteObservability } from "@/lib/route-observability";

type ComponentOverviewSummary = {
  total: number;
  overdue: number;
  dueSoon: number;
  critical: number;
  highRisk: number;
  totalCostExVat: number | null;
};

const ROUTE = "/api/properties/[id]/components/overview";
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
  observability.logger.warn("component overview request rejected", observability.elapsed({ event: options.event, ...options.context }));
  return apiErrorResponse({ status: options.status, code: options.code, message: options.message, requestId: observability.requestId });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, { status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", event: "components.overview.unauthorized" });
    }
    if (!user.company_id) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Användaren saknar organisation", event: "components.overview.missing_company", context: { userId: user.id } });
    }

    const { id: propertyId } = await params;
    const property = await db.property.findFirst({
      where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
      select: { id: true, name: true },
    });
    if (!property) {
      return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Fastigheten hittades inte", event: "components.overview.property_not_found", context: { userId: user.id, companyId: user.company_id } });
    }

    const components = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT a.*, b."name" AS "building_name",
        COALESCE(costs."total_cost", 0) AS "total_cost_ex_vat",
        COALESCE(events."event_count", 0) AS "event_count",
        events."latest_event_at"
      FROM "PropertyTechnicalAsset" a
      LEFT JOIN "Building" b ON b."id" = a."building_id"
      LEFT JOIN (
        SELECT "technical_asset_id", SUM("amount_ex_vat") AS "total_cost"
        FROM "ComponentCostEntry"
        WHERE "company_id" = ${user.company_id} AND "property_id" = ${property.id}
        GROUP BY "technical_asset_id"
      ) costs ON costs."technical_asset_id" = a."id"
      LEFT JOIN (
        SELECT "technical_asset_id", COUNT(*) AS "event_count", MAX("event_date") AS "latest_event_at"
        FROM "ComponentLifecycleEvent"
        WHERE "company_id" = ${user.company_id} AND "property_id" = ${property.id}
        GROUP BY "technical_asset_id"
      ) events ON events."technical_asset_id" = a."id"
      WHERE a."property_id" = ${property.id} AND a."company_id" = ${user.company_id}
      ORDER BY
        CASE WHEN a."next_service_at" IS NOT NULL AND a."next_service_at" < CURRENT_DATE THEN 0 ELSE 1 END,
        a."next_service_at" ASC NULLS LAST,
        a."criticality" DESC,
        a."name" ASC
    `);

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const rawSummary = components.reduce<Omit<ComponentOverviewSummary, "totalCostExVat"> & { totalCostExVat: number }>(
      (result, row) => {
        const next = row.next_service_at ? new Date(String(row.next_service_at)) : null;
        const condition = Number(row.condition_grade || 0);
        result.total += 1;
        result.totalCostExVat += Number(row.total_cost_ex_vat || 0);
        if (next && next < now) result.overdue += 1;
        else if (next && next <= in30Days) result.dueSoon += 1;
        if (String(row.criticality) === "critical" || condition >= 5) result.critical += 1;
        else if (String(row.criticality) === "high" || condition >= 4) result.highRisk += 1;
        return result;
      },
      { total: 0, overdue: 0, dueSoon: 0, critical: 0, highRisk: 0, totalCostExVat: 0 },
    );

    const includeFinance = canViewFinanceData(user.role);
    const safeComponents = includeFinance
      ? components
      : components.map((row) => ({ ...row, replacement_value: null, total_cost_ex_vat: null }));
    const summary: ComponentOverviewSummary = {
      ...rawSummary,
      totalCostExVat: includeFinance ? rawSummary.totalCostExVat : null,
    };

    observability.logger.info("component overview completed", observability.elapsed({
      event: "components.overview.completed",
      userId: user.id,
      companyId: user.company_id,
      propertyId: property.id,
      componentCount: components.length,
      includeFinance,
    }));

    return observability.correlate(NextResponse.json({ property, components: safeComponents, summary }, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("component overview failed", error, observability.elapsed({ event: "components.overview.failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}
