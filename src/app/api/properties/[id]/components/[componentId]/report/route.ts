import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";

function csvCell(value: unknown) {
  const text = value == null ? "" : value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; componentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id: propertyId, componentId } = await params;
  const property = await db.property.findFirst({
    where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
    select: { id: true, name: true, address: true, postal_code: true, city: true, property_identifier: true },
  });
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
    LEFT JOIN "User" u ON u."id" = e."created_by_id"
    LEFT JOIN "WorkOrder" w ON w."id" = e."work_order_id" AND w."company_id" = ${user.company_id} AND w."deleted_at" IS NULL
    LEFT JOIN "Project" p ON p."id" = e."project_id" AND p."company_id" = ${user.company_id} AND p."deleted_at" IS NULL
    WHERE e."technical_asset_id" = ${componentId} AND e."property_id" = ${propertyId} AND e."company_id" = ${user.company_id}
    ORDER BY e."event_date" DESC, e."created_at" DESC
  `);
  const costs = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT c.*, u."name" AS "created_by_name", u."email" AS "created_by_email",
      w."title" AS "work_order_title", p."name" AS "project_name"
    FROM "ComponentCostEntry" c
    LEFT JOIN "User" u ON u."id" = c."created_by_id"
    LEFT JOIN "WorkOrder" w ON w."id" = c."work_order_id" AND w."company_id" = ${user.company_id} AND w."deleted_at" IS NULL
    LEFT JOIN "Project" p ON p."id" = c."project_id" AND p."company_id" = ${user.company_id} AND p."deleted_at" IS NULL
    WHERE c."technical_asset_id" = ${componentId} AND c."property_id" = ${propertyId} AND c."company_id" = ${user.company_id}
    ORDER BY c."cost_date" DESC, c."created_at" DESC
  `);
  const audits = await db.auditLog.findMany({
    where: {
      company_id: user.company_id,
      OR: [
        { entity_type: "technical_asset", entity_id: componentId },
        { entity_type: { in: ["component_lifecycle_event", "component_cost_entry"] }, metadata: { path: ["componentId"], equals: componentId } },
      ],
    },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { created_at: "desc" },
    take: 500,
  });

  const url = new URL(request.url);
  if (url.searchParams.get("format") === "csv") {
    const rows: string[][] = [["Sektion", "Datum", "Typ", "Rubrik/Beskrivning", "Leverantör/Användare", "Belopp exkl. moms", "Moms %", "Arbetsorder", "Projekt", "Övrigt"]];
    rows.push(["Komponent", "", String(component.category || component.component_class || ""), String(component.name || ""), String(component.responsible_supplier || ""), String(component.replacement_value || ""), "", "", "", JSON.stringify(component)]);
    for (const event of events) rows.push(["Händelse", String(event.event_date || ""), String(event.event_type || ""), `${event.title || ""}${event.description ? ` – ${event.description}` : ""}`, String(event.provider || event.created_by_name || event.created_by_email || ""), "", "", String(event.work_order_title || ""), String(event.project_name || ""), String(event.result || "")]);
    for (const cost of costs) rows.push(["Kostnad", String(cost.cost_date || ""), String(cost.cost_type || ""), String(cost.description || ""), String(cost.supplier || cost.created_by_name || cost.created_by_email || ""), String(cost.amount_ex_vat || "0"), String(cost.vat_rate || "0"), String(cost.work_order_title || ""), String(cost.project_name || ""), ""]);
    for (const audit of audits) rows.push(["Revision", audit.created_at.toISOString(), audit.action, audit.entity_type, audit.actor?.name || audit.actor?.email || "System", "", "", "", "", JSON.stringify(audit.metadata || {})]);
    const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
    const safeName = String(component.name || "komponent").replace(/[^a-zA-Z0-9åäöÅÄÖ_-]+/g, "-").slice(0, 80);
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="revalta-livscykel-${safeName}.csv"`, "Cache-Control": "private, no-store" } });
  }

  return NextResponse.json({ property, component, events, costs, audits, summary: { eventCount: events.length, costCount: costs.length, auditCount: audits.length, totalCostExVat: costs.reduce((sum, row) => sum + Number(row.amount_ex_vat || 0), 0) } });
}
