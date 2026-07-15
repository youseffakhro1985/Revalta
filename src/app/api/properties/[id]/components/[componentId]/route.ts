import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; componentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id: propertyId, componentId } = await params;
  const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true, name: true } });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  const components = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT a.*, b."name" AS "building_name"
    FROM "PropertyTechnicalAsset" a
    LEFT JOIN "Building" b ON b."id" = a."building_id"
    WHERE a."id" = ${componentId} AND a."property_id" = ${propertyId} AND a."company_id" = ${user.company_id}
    LIMIT 1
  `);
  const component = components[0];
  if (!component) return NextResponse.json({ error: "Komponenten hittades inte" }, { status: 404 });

  const events = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT e.*, u."name" AS "created_by_name", u."email" AS "created_by_email",
      w."title" AS "work_order_title", p."name" AS "project_name"
    FROM "ComponentLifecycleEvent" e
    JOIN "User" u ON u."id" = e."created_by_id"
    LEFT JOIN "WorkOrder" w ON w."id" = e."work_order_id" AND w."company_id" = ${user.company_id}
    LEFT JOIN "Project" p ON p."id" = e."project_id" AND p."company_id" = ${user.company_id}
    WHERE e."technical_asset_id" = ${componentId} AND e."property_id" = ${propertyId} AND e."company_id" = ${user.company_id}
    ORDER BY e."event_date" DESC, e."created_at" DESC
    LIMIT 200
  `);

  const costs = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT c.*, u."name" AS "created_by_name", u."email" AS "created_by_email",
      w."title" AS "work_order_title", p."name" AS "project_name"
    FROM "ComponentCostEntry" c
    JOIN "User" u ON u."id" = c."created_by_id"
    LEFT JOIN "WorkOrder" w ON w."id" = c."work_order_id" AND w."company_id" = ${user.company_id}
    LEFT JOIN "Project" p ON p."id" = c."project_id" AND p."company_id" = ${user.company_id}
    WHERE c."technical_asset_id" = ${componentId} AND c."property_id" = ${propertyId} AND c."company_id" = ${user.company_id}
    ORDER BY c."cost_date" DESC, c."created_at" DESC
    LIMIT 200
  `);

  const linkedWorkOrders = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT DISTINCT w."id", w."title", w."status", w."priority", w."scheduled_end", w."actual_cost", w."updated_at"
    FROM "WorkOrder" w
    JOIN "ComponentLifecycleEvent" e ON e."work_order_id" = w."id"
    WHERE e."technical_asset_id" = ${componentId} AND w."company_id" = ${user.company_id}
    ORDER BY w."updated_at" DESC
    LIMIT 50
  `);

  const linkedProjects = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT DISTINCT p."id", p."name", p."status", p."risk", p."budget", p."actual", p."end_date", p."updated_at"
    FROM "Project" p
    JOIN "ComponentLifecycleEvent" e ON e."project_id" = p."id"
    WHERE e."technical_asset_id" = ${componentId} AND p."company_id" = ${user.company_id}
    ORDER BY p."updated_at" DESC
    LIMIT 50
  `);

  const metrics = {
    eventCount: events.length,
    totalCostExVat: costs.reduce((sum, item) => sum + Number(item.amount_ex_vat || 0), 0),
    nextDueAt: events.map((item) => item.next_due_at).filter(Boolean).sort()[0] || component.next_service_at || null,
    linkedWorkOrders: linkedWorkOrders.length,
    linkedProjects: linkedProjects.length,
  };

  return NextResponse.json({ property, component, events, costs, linkedWorkOrders, linkedProjects, metrics });
}
