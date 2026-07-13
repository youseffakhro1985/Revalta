import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

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
  return NextResponse.json({ report });
}
