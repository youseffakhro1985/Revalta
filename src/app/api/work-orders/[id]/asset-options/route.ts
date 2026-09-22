import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser, requireCompanyUser } from "@/lib/current-user";
import { isAssignedWorkAccessible, notFoundWorkOrder } from "@/lib/assigned-work-access";
import { API_ERROR_CODES } from "@/lib/api-error-response";
import {
  isMissingSchemaColumnError,
  isMissingTableError,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rawUser = await getCurrentUser();
  if (!rawUser) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const user = requireCompanyUser(rawUser);
  if (!user) return NextResponse.json({ error: "En aktiv organisation och personalbehörighet krävs" }, { status: 403 });

  const { id } = await params;
  try {
    const workOrder = await db.workOrder.findFirst({
      where: { deleted_at: null, id, company_id: user.company_id, property: { deleted_at: null } },
      select: { id: true, property_id: true, assigned_to_id: true },
    });
    if (!workOrder) return notFoundWorkOrder();
    if (!isAssignedWorkAccessible(user, workOrder.assigned_to_id)) return notFoundWorkOrder();

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
  } catch (error) {
    if (isMissingSchemaColumnError(error) || isMissingTableError(error)) {
      return NextResponse.json(
        {
          error: schemaMismatchUserMessage(),
          errorCode: API_ERROR_CODES.serviceUnavailable,
        },
        { status: 503 },
      );
    }
    throw error;
  }
}
