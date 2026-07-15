import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id: propertyId } = await params;
  const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true, name: true } });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

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
    WHERE a."company_id" = ${user.company_id} AND a."property_id" = ${propertyId}
    GROUP BY a."id", b."name"
    ORDER BY COALESCE(a."expected_replacement_year", 9999), COALESCE(a."condition_grade", 1) DESC, a."name"
  `);

  const currentYear = new Date().getFullYear();
  const metrics = {
    total: assets.length,
    poorCondition: assets.filter((item) => Number(item.condition_grade || 0) >= 4).length,
    replacementDue5Years: assets.filter((item) => {
      const year = Number(item.expected_replacement_year || 0);
      return year > 0 && year <= currentYear + 5;
    }).length,
    replacementValue: assets.reduce((sum, item) => sum + Number(item.replacement_value || 0), 0),
    lifetimeCost: assets.reduce((sum, item) => sum + Number(item.lifetime_cost || 0), 0),
  };

  return NextResponse.json({ property, assets, metrics, currentYear });
}
