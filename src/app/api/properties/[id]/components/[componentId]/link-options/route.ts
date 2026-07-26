import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";
import { sqlSoftDeleteGuard } from "@/lib/soft-delete-compat";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; componentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id: propertyId, componentId } = await params;
  const property = await db.property.findFirst({
    where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
    select: { id: true },
  });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  const component = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "PropertyTechnicalAsset"
    WHERE "id" = ${componentId}
      AND "property_id" = ${propertyId}
      AND "company_id" = ${user.company_id}
    LIMIT 1
  `);
  if (!component[0]) return NextResponse.json({ error: "Komponenten hittades inte" }, { status: 404 });

  const [workOrderGuard, projectGuard] = await Promise.all([
    sqlSoftDeleteGuard(db, "WorkOrder", "w"),
    sqlSoftDeleteGuard(db, "Project", "p"),
  ]);
  const [workOrders, projects] = await Promise.all([
    db.$queryRaw<Array<{ id: string; title: string; status: string; priority: string }>>(Prisma.sql`
      SELECT w."id", w."title", w."status", w."priority"
      FROM "WorkOrder" w
      WHERE w."company_id" = ${user.company_id}
        AND w."property_id" = ${propertyId}
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
        AND p."property_id" = ${propertyId}
        ${projectGuard}
      ORDER BY
        CASE WHEN p."status" IN ('completed', 'cancelled') THEN 1 ELSE 0 END,
        p."updated_at" DESC
      LIMIT 200
    `),
  ]);

  return NextResponse.json({ workOrders, projects });
}
