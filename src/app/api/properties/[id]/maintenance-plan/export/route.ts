import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";

type PlanRow = { id: string; name: string; version: number; base_year: number; horizon_years: number; annual_index_rate: number };
type ActionRow = { category: string; title: string; planned_year: number; recurrence_years: number | null; estimated_cost: number; annual_index_rate: number | null; priority: string; risk: string; status: string; contractor: string | null; building_name: string | null; technical_asset_name: string | null };

function quote(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function indexedCost(action: ActionRow, plan: PlanRow, year: number) {
  const rate = Number(action.annual_index_rate ?? plan.annual_index_rate) / 100;
  return Math.round(Number(action.estimated_cost) * Math.pow(1 + rate, Math.max(0, year - plan.base_year)));
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const property = await db.property.findFirst({ where: { id, deleted_at: null, ...tenantWhere(user) }, select: { id: true, name: true } });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  const [plan] = await db.$queryRaw<PlanRow[]>(Prisma.sql`
    SELECT "id", "name", "version", "base_year", "horizon_years", "annual_index_rate"::double precision AS "annual_index_rate"
    FROM "MaintenancePlan"
    WHERE "company_id" = ${user.company_id} AND "property_id" = ${id}
    ORDER BY CASE "status" WHEN 'active' THEN 1 ELSE 2 END, "version" DESC
    LIMIT 1
  `);
  if (!plan) return NextResponse.json({ error: "Ingen underhållsplan finns" }, { status: 404 });

  const actions = await db.$queryRaw<ActionRow[]>(Prisma.sql`
    SELECT a."category", a."title", a."planned_year", a."recurrence_years",
           a."estimated_cost"::double precision AS "estimated_cost",
           a."annual_index_rate"::double precision AS "annual_index_rate",
           a."priority", a."risk", a."status", a."contractor",
           b."name" AS "building_name", t."name" AS "technical_asset_name"
    FROM "MaintenanceAction" a
    LEFT JOIN "Building" b ON b."id" = a."building_id"
    LEFT JOIN "PropertyTechnicalAsset" t ON t."id" = a."technical_asset_id"
    WHERE a."company_id" = ${user.company_id} AND a."property_id" = ${id} AND a."maintenance_plan_id" = ${plan.id}
    ORDER BY a."planned_year", a."title"
  `);

  const rows = [["Fastighet", "Plan", "Version", "Kategori", "Åtgärd", "År", "Byggnad", "Installation", "Kostnad dagens värde", "Indexerad kostnad", "Intervall år", "Prioritet", "Risk", "Status", "Entreprenör"]];
  for (const action of actions) {
    const endYear = plan.base_year + plan.horizon_years - 1;
    let year = action.planned_year;
    while (year <= endYear) {
      rows.push([property.name, plan.name, String(plan.version), action.category, action.title, String(year), action.building_name ?? "Hela fastigheten", action.technical_asset_name ?? "", String(Math.round(action.estimated_cost)), String(indexedCost(action, plan, year)), action.recurrence_years ? String(action.recurrence_years) : "", action.priority, action.risk, action.status, action.contractor ?? ""]);
      if (!action.recurrence_years) break;
      year += action.recurrence_years;
    }
  }

  const csv = "\uFEFF" + rows.map((row) => row.map(quote).join(";")).join("\r\n");
  const filename = `underhallsplan-${property.name.toLowerCase().replace(/[^a-z0-9åäö]+/gi, "-")}.csv`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}
