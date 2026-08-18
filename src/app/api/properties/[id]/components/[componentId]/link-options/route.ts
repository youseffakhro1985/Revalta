import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { createRouteObservability } from "@/lib/route-observability";
import { sqlSoftDeleteGuard } from "@/lib/soft-delete-compat";

const ROUTE = "/api/properties/[id]/components/[componentId]/link-options";
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
  observability.logger.warn("component link options request rejected", observability.elapsed({ event: options.event, ...options.context }));
  return apiErrorResponse({ status: options.status, code: options.code, message: options.message, requestId: observability.requestId });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; componentId: string }> },
) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, { status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", event: "components.link_options.unauthorized" });
    }
    if (!user.company_id) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Användaren saknar organisation", event: "components.link_options.missing_company", context: { userId: user.id } });
    }
    if (!canCreateProperties(user.role)) {
      return reject(observability, { status: 403, code: API_ERROR_CODES.forbidden, message: "Du saknar behörighet att länka komponenthistorik", event: "components.link_options.forbidden", context: { userId: user.id, companyId: user.company_id } });
    }

    const { id: propertyId, componentId } = await params;
    const property = await db.property.findFirst({
      where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
      select: { id: true },
    });
    if (!property) {
      return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Fastigheten hittades inte", event: "components.link_options.property_not_found", context: { userId: user.id, companyId: user.company_id } });
    }

    const component = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "PropertyTechnicalAsset"
      WHERE "id" = ${componentId}
        AND "property_id" = ${property.id}
        AND "company_id" = ${user.company_id}
      LIMIT 1
    `);
    if (!component[0]) {
      return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Komponenten hittades inte", event: "components.link_options.component_not_found", context: { userId: user.id, companyId: user.company_id, propertyId: property.id } });
    }

    const [workOrderGuard, projectGuard] = await Promise.all([
      sqlSoftDeleteGuard(db, "WorkOrder", "w"),
      sqlSoftDeleteGuard(db, "Project", "p"),
    ]);
    const [workOrders, projects] = await Promise.all([
      db.$queryRaw<Array<{ id: string; title: string; status: string; priority: string }>>(Prisma.sql`
        SELECT w."id", w."title", w."status", w."priority"
        FROM "WorkOrder" w
        WHERE w."company_id" = ${user.company_id}
          AND w."property_id" = ${property.id}
          ${workOrderGuard}
        ORDER BY
          CASE WHEN w."status" IN ('completed', 'cancelled') THEN 1 ELSE 0 END,
          w."updated_at" DESC
        LIMIT 200
      `),
      db.$queryRaw<Array<{ id: string; name: string; status: string; risk: string }>>(Prisma.sql`
        SELECT p."id", p."name", p."status", p."risk"
        FROM "Project" p
        WHERE p."company_id" = ${user.company_id}
          AND p."property_id" = ${property.id}
          ${projectGuard}
        ORDER BY
          CASE WHEN p."status" IN ('completed', 'cancelled') THEN 1 ELSE 0 END,
          p."updated_at" DESC
        LIMIT 200
      `),
    ]);

    observability.logger.info("component link options read completed", observability.elapsed({ event: "components.link_options.completed", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId }));
    return observability.correlate(NextResponse.json({ workOrders, projects }, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("component link options read failed", error, observability.elapsed({ event: "components.link_options.failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}
