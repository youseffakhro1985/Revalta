import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const workOrder = await db.workOrder.findFirst({
    where: { deleted_at: null, id, company_id: user.company_id },
    select: { id: true, property_id: true },
  });
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const [buildings, assets] = await Promise.all([
    db.building.findMany({
      where: { property_id: workOrder.property_id },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, address: true },
    }),
    db.$queryRaw<Array<{
      id: string;
      name: string;
      category: string;
      component_class: string | null;
      location: string | null;
      status: string;
      criticality: string;
      building_id: string | null;
      building_name: string | null;
    }>>(Prisma.sql`
      SELECT a."id", a."name", a."category", a."component_class", a."location", a."status", a."criticality",
             a."building_id", b."name" AS "building_name"
      FROM "PropertyTechnicalAsset" a
      LEFT JOIN "Building" b ON b."id" = a."building_id"
      WHERE a."company_id" = ${user.company_id}
        AND a."property_id" = ${workOrder.property_id}
      ORDER BY COALESCE(b."name", ''), a."name"
    `),
  ]);

  return NextResponse.json(
    { buildings, assets },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
