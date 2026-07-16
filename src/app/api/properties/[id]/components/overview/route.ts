import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";

type ComponentOverviewSummary = {
  total: number;
  overdue: number;
  dueSoon: number;
  critical: number;
  highRisk: number;
  totalCostExVat: number;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id: propertyId } = await params;
  const property = await db.property.findFirst({
    where: { id: propertyId, ...tenantWhere(user) },
    select: { id: true, name: true },
  });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

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
      WHERE "company_id" = ${user.company_id} AND "property_id" = ${propertyId}
      GROUP BY "technical_asset_id"
    ) costs ON costs."technical_asset_id" = a."id"
    LEFT JOIN (
      SELECT "technical_asset_id", COUNT(*) AS "event_count", MAX("event_date") AS "latest_event_at"
      FROM "ComponentLifecycleEvent"
      WHERE "company_id" = ${user.company_id} AND "property_id" = ${propertyId}
      GROUP BY "technical_asset_id"
    ) events ON events."technical_asset_id" = a."id"
    WHERE a."property_id" = ${propertyId} AND a."company_id" = ${user.company_id}
    ORDER BY
      CASE WHEN a."next_service_at" IS NOT NULL AND a."next_service_at" < CURRENT_DATE THEN 0 ELSE 1 END,
      a."next_service_at" ASC NULLS LAST,
      a."criticality" DESC,
      a."name" ASC
  `);

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const summary = components.reduce<ComponentOverviewSummary>(
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
    { total: 0, overdue: 0, dueSoon: 0, critical: 0, highRisk: 0, totalCostExVat: 0 }
  );

  return NextResponse.json({ property, components, summary }, { headers: { "Cache-Control": "private, no-store" } });
}
