import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser, requireCompanyUser } from "@/lib/current-user";
import { findAccessibleWorkOrder, notFoundWorkOrder } from "@/lib/assigned-work-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const rawUser = await getCurrentUser();
  if (!rawUser) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const user = requireCompanyUser(rawUser);
  if (!user) return NextResponse.json({ error: "En aktiv organisation och personalbehörighet krävs" }, { status: 403 });

  const { reportId } = await params;
  const reports = await db.$queryRaw<Array<{
    id: string;
    work_order_id: string;
    version: number;
    status: string;
    title: string;
    snapshot: Record<string, unknown>;
    approved_at: Date | null;
    created_at: Date;
  }>>(Prisma.sql`
    SELECT "id", "work_order_id", "version", "status", "title", "snapshot", "approved_at", "created_at"
    FROM "WorkOrderReport"
    WHERE "id" = ${reportId} AND "company_id" = ${user.company_id}
    LIMIT 1
  `);

  const report = reports[0];
  if (!report) return NextResponse.json({ error: "Rapporten hittades inte" }, { status: 404 });
  if (!await findAccessibleWorkOrder(user, report.work_order_id)) {
    return notFoundWorkOrder();
  }
  return NextResponse.json({ report });
}
