import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canViewFinanceData, canViewOperations, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const property = await db.property.findFirst({ where: { id, deleted_at: null, ...tenantWhere(user) }, select: { id: true, name: true } });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  const plans = await db.$queryRaw<Array<{
    id: string;
    name: string;
    version: number;
    status: string;
    base_year: number;
    horizon_years: number;
    annual_index_rate: number;
    approved_at: string | null;
    approved_by_name: string | null;
    created_at: string;
    action_count: number;
    estimated_total: number;
  }>>(Prisma.sql`
    SELECT p."id", p."name", p."version", p."status", p."base_year", p."horizon_years",
           p."annual_index_rate"::double precision AS "annual_index_rate", p."approved_at",
           u."name" AS "approved_by_name", p."created_at",
           COUNT(a."id")::integer AS "action_count",
           COALESCE(SUM(a."estimated_cost"), 0)::double precision AS "estimated_total"
    FROM "MaintenancePlan" p
    LEFT JOIN "User" u ON u."id" = p."approved_by_id"
    LEFT JOIN "MaintenanceAction" a ON a."maintenance_plan_id" = p."id" AND a."status" <> 'cancelled'
    WHERE p."company_id" = ${user.company_id} AND p."property_id" = ${id}
    GROUP BY p."id", u."name"
    ORDER BY p."version" DESC
  `);

  const includeFinance = canViewFinanceData(user.role);

  return NextResponse.json({
    property,
    plans: includeFinance
      ? plans
      : plans.map((plan) => ({ ...plan, estimated_total: null })),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canViewOperations(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const property = await db.property.findFirst({ where: { id, deleted_at: null, ...tenantWhere(user) }, select: { id: true } });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  const body = await request.json();
  const planId = String(body.planId || "").trim();
  const action = String(body.action || "");
  if (!planId) return NextResponse.json({ error: "Planversion saknas" }, { status: 400 });

  const [plan] = await db.$queryRaw<Array<{ id: string; status: string; name: string; version: number }>>(Prisma.sql`
    SELECT "id", "status", "name", "version" FROM "MaintenancePlan"
    WHERE "id" = ${planId} AND "company_id" = ${user.company_id} AND "property_id" = ${id}
    LIMIT 1
  `);
  if (!plan) return NextResponse.json({ error: "Planversionen hittades inte" }, { status: 404 });

  if (action === "plan.approve") {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "MaintenancePlan" SET "status" = 'archived', "updated_at" = CURRENT_TIMESTAMP
        WHERE "company_id" = ${user.company_id} AND "property_id" = ${id} AND "status" = 'active' AND "id" <> ${planId}
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "MaintenancePlan" SET "status" = 'active', "approved_by_id" = ${user.id},
          "approved_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${planId} AND "company_id" = ${user.company_id} AND "property_id" = ${id}
      `);
    });
    await writeAuditLog(user, {
      entityType: "maintenance_plan",
      entityId: planId,
      action: "maintenance_plan.approved",
      metadata: { propertyId: id, previousStatus: plan.status, name: plan.name, version: plan.version },
    });
    return NextResponse.json({ success: true });
  }

  if (action === "plan.archive") {
    await db.$executeRaw(Prisma.sql`
      UPDATE "MaintenancePlan" SET "status" = 'archived', "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${planId} AND "company_id" = ${user.company_id} AND "property_id" = ${id}
    `);
    await writeAuditLog(user, {
      entityType: "maintenance_plan",
      entityId: planId,
      action: "maintenance_plan.archived",
      metadata: { propertyId: id, previousStatus: plan.status, name: plan.name, version: plan.version },
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Okänd åtgärd" }, { status: 400 });
}
