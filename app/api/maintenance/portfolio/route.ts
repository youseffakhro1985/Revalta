import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

type PortfolioRow = {
  property_id: string;
  property_name: string;
  plan_id: string;
  plan_name: string;
  base_year: number;
  horizon_years: number;
  annual_index_rate: number;
  action_id: string | null;
  category: string | null;
  planned_year: number | null;
  recurrence_years: number | null;
  estimated_cost: number | null;
  action_index_rate: number | null;
  risk: string | null;
  status: string | null;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const rows = await db.$queryRaw<PortfolioRow[]>(Prisma.sql`
    SELECT
      p."id" AS "property_id",
      p."name" AS "property_name",
      mp."id" AS "plan_id",
      mp."name" AS "plan_name",
      mp."base_year",
      mp."horizon_years",
      mp."annual_index_rate"::double precision AS "annual_index_rate",
      ma."id" AS "action_id",
      ma."category",
      ma."planned_year",
      ma."recurrence_years",
      ma."estimated_cost"::double precision AS "estimated_cost",
      ma."annual_index_rate"::double precision AS "action_index_rate",
      ma."risk",
      ma."status"
    FROM "MaintenancePlan" mp
    JOIN "Property" p ON p."id" = mp."property_id"
    LEFT JOIN "MaintenanceAction" ma ON ma."maintenance_plan_id" = mp."id"
    WHERE mp."company_id" = ${user.company_id}
      AND mp."status" = 'active'
      AND p."company_id" = ${user.company_id}
    ORDER BY p."name", ma."planned_year", ma."title"
  `);

  return NextResponse.json({ rows });
}
