import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { canViewFinanceData, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { createRouteObservability } from "@/lib/route-observability";
import { sqlSoftDeleteGuard } from "@/lib/soft-delete-compat";

const ROUTE = "/api/properties/[id]/components/[componentId]/report";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function csvCell(value: unknown) {
  let text = value == null ? "" : value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@]/.test(text.trimStart())) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
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
  observability.logger.warn("component report request rejected", observability.elapsed({ event: options.event, ...options.context }));
  return apiErrorResponse({ status: options.status, code: options.code, message: options.message, requestId: observability.requestId });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; componentId: string }> }) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, { status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", event: "components.report.unauthorized" });
    }
    if (!user.company_id) {
      return reject(observability, { status: 400, code: API_ERROR_CODES.validationFailed, message: "Användaren saknar organisation", event: "components.report.missing_company", context: { userId: user.id } });
    }

    const { id: propertyId, componentId } = await params;
    const property = await db.property.findFirst({
      where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
      select: { id: true, name: true, address: true, postal_code: true, city: true, property_identifier: true },
    });
    if (!property) {
      return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Fastigheten hittades inte", event: "components.report.property_not_found", context: { userId: user.id, companyId: user.company_id } });
    }

    const components = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT a.*, b."name" AS "building_name"
      FROM "PropertyTechnicalAsset" a
      LEFT JOIN "Building" b ON b."id" = a."building_id"
      WHERE a."id" = ${componentId} AND a."property_id" = ${property.id} AND a."company_id" = ${user.company_id}
      LIMIT 1
    `);
    const component = components[0];
    if (!component) {
      return reject(observability, { status: 404, code: API_ERROR_CODES.notFound, message: "Komponenten hittades inte", event: "components.report.component_not_found", context: { userId: user.id, companyId: user.company_id, propertyId: property.id } });
    }

    const [workOrderGuard, projectGuard] = await Promise.all([
      sqlSoftDeleteGuard(db, "WorkOrder", "w"),
      sqlSoftDeleteGuard(db, "Project", "p"),
    ]);
    const events = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT e.*, u."name" AS "created_by_name", u."email" AS "created_by_email",
        w."title" AS "work_order_title", p."name" AS "project_name"
      FROM "ComponentLifecycleEvent" e
      LEFT JOIN "User" u ON u."id" = e."created_by_id"
      LEFT JOIN "WorkOrder" w ON w."id" = e."work_order_id" AND w."company_id" = ${user.company_id} ${workOrderGuard}
      LEFT JOIN "Project" p ON p."id" = e."project_id" AND p."company_id" = ${user.company_id} ${projectGuard}
      WHERE e."technical_asset_id" = ${componentId} AND e."property_id" = ${property.id} AND e."company_id" = ${user.company_id}
      ORDER BY e."event_date" DESC, e."created_at" DESC
    `);
    const costs = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT c.*, u."name" AS "created_by_name", u."email" AS "created_by_email",
        w."title" AS "work_order_title", p."name" AS "project_name"
      FROM "ComponentCostEntry" c
      LEFT JOIN "User" u ON u."id" = c."created_by_id"
      LEFT JOIN "WorkOrder" w ON w."id" = c."work_order_id" AND w."company_id" = ${user.company_id} ${workOrderGuard}
      LEFT JOIN "Project" p ON p."id" = c."project_id" AND p."company_id" = ${user.company_id} ${projectGuard}
      WHERE c."technical_asset_id" = ${componentId} AND c."property_id" = ${property.id} AND c."company_id" = ${user.company_id}
      ORDER BY c."cost_date" DESC, c."created_at" DESC
    `);
    const audits = await db.auditLog.findMany({
      where: {
        company_id: user.company_id,
        OR: [
          { entity_type: "technical_asset", entity_id: componentId },
          { entity_type: { in: ["component_lifecycle_event", "component_cost_entry"] }, metadata: { path: ["componentId"], equals: componentId } },
        ],
      },
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { created_at: "desc" },
      take: 500,
    });

    const includeFinance = canViewFinanceData(user.role);
    const safeComponent = includeFinance ? component : { ...component, replacement_value: null };
    const safeCosts = includeFinance ? costs : costs.map((item) => ({ ...item, amount_ex_vat: null }));
    const safeAudits = includeFinance ? audits : audits.map((item) => ({ ...item, metadata: null }));
    const totalCostExVat = includeFinance ? costs.reduce((sum, row) => sum + Number(row.amount_ex_vat || 0), 0) : null;

    const format = new URL(request.url).searchParams.get("format") || "json";
    observability.logger.info("component report generated", observability.elapsed({ event: "components.report.completed", userId: user.id, companyId: user.company_id, propertyId: property.id, componentId, format, includeFinance }));

    if (format === "csv") {
      const rows: string[][] = [["Sektion", "Datum", "Typ", "Rubrik/Beskrivning", "Leverantör/Användare", "Belopp exkl. moms", "Moms %", "Arbetsorder", "Projekt", "Övrigt"]];
      rows.push(["Komponent", "", String(component.category || component.component_class || ""), String(component.name || ""), String(component.responsible_supplier || ""), includeFinance ? String(component.replacement_value || "") : "", "", "", "", JSON.stringify(safeComponent)]);
      for (const event of events) rows.push(["Händelse", String(event.event_date || ""), String(event.event_type || ""), `${event.title || ""}${event.description ? ` – ${event.description}` : ""}`, String(event.provider || event.created_by_name || event.created_by_email || ""), "", "", String(event.work_order_title || ""), String(event.project_name || ""), String(event.result || "")]);
      for (const cost of safeCosts) rows.push(["Kostnad", String(cost.cost_date || ""), String(cost.cost_type || ""), String(cost.description || ""), String(cost.supplier || cost.created_by_name || cost.created_by_email || ""), includeFinance ? String(cost.amount_ex_vat || "0") : "", String(cost.vat_rate || "0"), String(cost.work_order_title || ""), String(cost.project_name || ""), ""]);
      for (const audit of safeAudits) rows.push(["Revision", audit.created_at.toISOString(), audit.action, audit.entity_type, audit.actor?.name || audit.actor?.email || "System", "", "", "", "", includeFinance ? JSON.stringify(audit.metadata || {}) : ""]);
      const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
      const safeName = String(component.name || "komponent").replace(/[^a-zA-Z0-9åäöÅÄÖ_-]+/g, "-").slice(0, 80);
      return observability.correlate(new Response(csv, { headers: { ...SUCCESS_HEADERS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="revalta-livscykel-${safeName}.csv"` } }));
    }

    return observability.correlate(NextResponse.json({
      property,
      component: safeComponent,
      events,
      costs: safeCosts,
      audits: safeAudits,
      summary: { eventCount: events.length, costCount: costs.length, auditCount: audits.length, totalCostExVat },
    }, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("component report generation failed", error, observability.elapsed({ event: "components.report.failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}
