import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { runPreventiveMaintenanceEngine } from "@/lib/preventive-maintenance-engine";

export const dynamic = "force-dynamic";

type OverviewRow = {
  id: string;
  property_id: string;
  property_name: string;
  building_name: string | null;
  name: string;
  category: string | null;
  location: string | null;
  criticality: string | null;
  next_service_at: Date | null;
  service_interval_months: number;
  service_lead_days: number;
  auto_create_service_work_orders: boolean;
  work_order_id: string | null;
  work_order_number: string | null;
  work_order_status: string | null;
  maintenance_cycle_key: string | null;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const rows = await db.$queryRaw<OverviewRow[]>(Prisma.sql`
    SELECT a."id", a."property_id", p."name" AS "property_name", b."name" AS "building_name",
           a."name", a."category", a."location", a."criticality", a."next_service_at",
           a."service_interval_months", a."service_lead_days", a."auto_create_service_work_orders",
           w."id" AS "work_order_id", w."work_order_number", w."status" AS "work_order_status",
           w."maintenance_cycle_key"
    FROM "PropertyTechnicalAsset" a
    INNER JOIN "Property" p ON p."id" = a."property_id" AND p."company_id" = a."company_id"
    LEFT JOIN "Building" b ON b."id" = a."building_id"
    LEFT JOIN LATERAL (
      SELECT wo."id", wo."work_order_number", wo."status", wo."maintenance_cycle_key"
      FROM "WorkOrder" wo
      WHERE wo."company_id" = a."company_id"
        AND wo."technical_asset_id" = a."id"
        AND wo."source" = 'maintenance_plan'
      ORDER BY wo."created_at" DESC
      LIMIT 1
    ) w ON TRUE
    WHERE a."company_id" = ${user.company_id}
      AND COALESCE(a."status", 'active') IN ('active', 'planned')
    ORDER BY a."next_service_at" ASC NULLS LAST, a."criticality" DESC, a."name" ASC
    LIMIT 1000
  `);

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 86_400_000);
  const metrics = {
    total: rows.length,
    overdue: rows.filter((row) => row.next_service_at && row.next_service_at < now).length,
    dueSoon: rows.filter((row) => row.next_service_at && row.next_service_at >= now && row.next_service_at <= in30Days).length,
    automatic: rows.filter((row) => row.auto_create_service_work_orders).length,
    withWorkOrder: rows.filter((row) => row.work_order_id).length,
  };

  return NextResponse.json({ rows, metrics, canRun: canManageTickets(user.role) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

  const result = await runPreventiveMaintenanceEngine({ companyId: user.company_id });
  await writeAuditLog(user, {
    entityType: "preventive_maintenance",
    entityId: user.company_id,
    action: "preventive_maintenance.manual_run",
    metadata: result,
  });
  return NextResponse.json({ result });
}
