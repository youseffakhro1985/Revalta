import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const property = await db.property.findFirst({
    where: { id, ...tenantWhere(user) },
    include: {
      buildings: { orderBy: { name: "asc" }, include: { _count: { select: { units: true } } } },
      units: { orderBy: [{ unit_type: "asc" }, { designation: "asc" }], include: { building: { select: { id: true, name: true } } } },
      work_orders: {
        orderBy: { updated_at: "desc" }, take: 12,
        select: { id: true, title: true, status: true, priority: true, scheduled_end: true, actual_cost: true, updated_at: true },
      },
      projects: {
        orderBy: { updated_at: "desc" }, take: 12,
        select: { id: true, name: true, status: true, risk: true, budget: true, forecast: true, actual: true, end_date: true, updated_at: true },
      },
      _count: { select: { tickets: true, buildings: true, units: true, work_orders: true, projects: true } },
    },
  });

  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  const companyId = user.company_id;
  const [entrances, assets, warranties, inspections, agreements] = await Promise.all([
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT e.*, b."name" AS "building_name"
      FROM "PropertyEntrance" e
      LEFT JOIN "Building" b ON b."id" = e."building_id"
      WHERE e."company_id" = ${companyId} AND e."property_id" = ${id}
      ORDER BY e."name" ASC
    `),
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT a.*, b."name" AS "building_name"
      FROM "PropertyTechnicalAsset" a
      LEFT JOIN "Building" b ON b."id" = a."building_id"
      WHERE a."company_id" = ${companyId} AND a."property_id" = ${id}
      ORDER BY CASE a."criticality" WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
               a."next_service_at" ASC NULLS LAST, a."name" ASC
    `),
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT w.*, a."name" AS "technical_asset_name"
      FROM "PropertyWarranty" w
      LEFT JOIN "PropertyTechnicalAsset" a ON a."id" = w."technical_asset_id"
      WHERE w."company_id" = ${companyId} AND w."property_id" = ${id}
      ORDER BY w."expires_at" ASC NULLS LAST, w."title" ASC
    `),
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT i.*, a."name" AS "technical_asset_name"
      FROM "PropertyInspection" i
      LEFT JOIN "PropertyTechnicalAsset" a ON a."id" = i."technical_asset_id"
      WHERE i."company_id" = ${companyId} AND i."property_id" = ${id}
      ORDER BY COALESCE(i."next_due_at", i."scheduled_at") ASC NULLS LAST, i."title" ASC
    `),
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT s.*, a."name" AS "technical_asset_name",
             s."cost_amount"::double precision AS "cost_amount"
      FROM "PropertyServiceAgreement" s
      LEFT JOIN "PropertyTechnicalAsset" a ON a."id" = s."technical_asset_id"
      WHERE s."company_id" = ${companyId} AND s."property_id" = ${id}
      ORDER BY s."ends_at" ASC NULLS LAST, s."supplier" ASC
    `),
  ]);

  const now = Date.now();
  const inDays = (value: unknown, days: number) => {
    if (!value) return false;
    const time = new Date(String(value)).getTime();
    return Number.isFinite(time) && time >= now && time <= now + days * 86_400_000;
  };

  const metrics = {
    entrances: entrances.length,
    technicalAssets: assets.length,
    criticalAssets: assets.filter((item) => item.criticality === "critical" || item.status === "out_of_service").length,
    serviceDue90Days: assets.filter((item) => inDays(item.next_service_at, 90) || item.status === "service_due").length,
    warrantiesExpiring180Days: warranties.filter((item) => inDays(item.expires_at, 180)).length,
    inspectionsDue90Days: inspections.filter((item) => inDays(item.next_due_at || item.scheduled_at, 90) || item.status === "overdue").length,
    agreementsEnding180Days: agreements.filter((item) => inDays(item.ends_at, 180)).length,
  };

  return NextResponse.json({ property, entrances, assets, warranties, inspections, agreements, metrics });
}
