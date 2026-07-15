import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";

const COMPONENT_STATUSES = new Set(["active", "planned", "inactive", "replaced", "decommissioned"]);
const CRITICALITIES = new Set(["low", "normal", "high", "critical"]);

function optionalText(value: unknown, maxLength = 255) {
  if (value == null || value === "") return null;
  return String(value).trim().slice(0, maxLength) || null;
}

function optionalInteger(value: unknown, min: number, max: number) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error("Ogiltigt heltal");
  return parsed;
}

function optionalNumber(value: unknown, min: number, max: number) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error("Ogiltigt belopp");
  return parsed;
}

function optionalDate(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error("Ogiltigt datum");
  return parsed;
}

async function resolveContext(params: Promise<{ id: string; componentId: string }>) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Obehörig" }, { status: 401 }) };
  if (!user.company_id) return { error: NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 }) };

  const { id: propertyId, componentId } = await params;
  const property = await db.property.findFirst({
    where: { id: propertyId, ...tenantWhere(user) },
    select: { id: true, name: true },
  });
  if (!property) return { error: NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 }) };

  return { user, propertyId, componentId, property };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; componentId: string }> }) {
  const context = await resolveContext(params);
  if ("error" in context) return context.error;
  const { user, propertyId, componentId, property } = context;

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
    JOIN "User" u ON u."id" = e."created_by_id"
    LEFT JOIN "WorkOrder" w ON w."id" = e."work_order_id" AND w."company_id" = ${user.company_id}
    LEFT JOIN "Project" p ON p."id" = e."project_id" AND p."company_id" = ${user.company_id}
    WHERE e."technical_asset_id" = ${componentId} AND e."property_id" = ${propertyId} AND e."company_id" = ${user.company_id}
    ORDER BY e."event_date" DESC, e."created_at" DESC
    LIMIT 200
  `);

  const costs = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT c.*, u."name" AS "created_by_name", u."email" AS "created_by_email",
      w."title" AS "work_order_title", p."name" AS "project_name"
    FROM "ComponentCostEntry" c
    JOIN "User" u ON u."id" = c."created_by_id"
    LEFT JOIN "WorkOrder" w ON w."id" = c."work_order_id" AND w."company_id" = ${user.company_id}
    LEFT JOIN "Project" p ON p."id" = c."project_id" AND p."company_id" = ${user.company_id}
    WHERE c."technical_asset_id" = ${componentId} AND c."property_id" = ${propertyId} AND c."company_id" = ${user.company_id}
    ORDER BY c."cost_date" DESC, c."created_at" DESC
    LIMIT 200
  `);

  const linkedWorkOrders = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT DISTINCT w."id", w."title", w."status", w."priority", w."scheduled_end", w."actual_cost", w."updated_at"
    FROM "WorkOrder" w
    JOIN "ComponentLifecycleEvent" e ON e."work_order_id" = w."id"
    WHERE e."technical_asset_id" = ${componentId} AND w."company_id" = ${user.company_id}
    ORDER BY w."updated_at" DESC
    LIMIT 50
  `);

  const linkedProjects = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT DISTINCT p."id", p."name", p."status", p."risk", p."budget", p."actual", p."end_date", p."updated_at"
    FROM "Project" p
    JOIN "ComponentLifecycleEvent" e ON e."project_id" = p."id"
    WHERE e."technical_asset_id" = ${componentId} AND p."company_id" = ${user.company_id}
    ORDER BY p."updated_at" DESC
    LIMIT 50
  `);

  const metrics = {
    eventCount: events.length,
    totalCostExVat: costs.reduce((sum, item) => sum + Number(item.amount_ex_vat || 0), 0),
    nextDueAt: events.map((item) => item.next_due_at).filter(Boolean).sort()[0] || component.next_service_at || null,
    linkedWorkOrders: linkedWorkOrders.length,
    linkedProjects: linkedProjects.length,
  };

  return NextResponse.json({ property, component, events, costs, linkedWorkOrders, linkedProjects, metrics });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; componentId: string }> }) {
  const context = await resolveContext(params);
  if ("error" in context) return context.error;
  const { user, propertyId, componentId } = context;

  if (!canCreateProperties(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att ändra tekniska komponenter" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  }

  const name = String(body.name || "").trim().slice(0, 160);
  if (name.length < 2) return NextResponse.json({ error: "Komponentnamnet måste innehålla minst två tecken" }, { status: 400 });

  const status = String(body.status || "active");
  const criticality = String(body.criticality || "normal");
  if (!COMPONENT_STATUSES.has(status)) return NextResponse.json({ error: "Ogiltig komponentstatus" }, { status: 400 });
  if (!CRITICALITIES.has(criticality)) return NextResponse.json({ error: "Ogiltig kritikalitet" }, { status: 400 });

  try {
    const installationYear = optionalInteger(body.installation_year, 1800, 2200);
    const technicalLifetime = optionalInteger(body.technical_lifetime_years, 0, 500);
    const economicLifetime = optionalInteger(body.economic_lifetime_years, 0, 500);
    const replacementYear = optionalInteger(body.expected_replacement_year, 1800, 2500);
    const conditionGrade = optionalInteger(body.condition_grade, 1, 5);
    const replacementValue = optionalNumber(body.replacement_value, 0, 1_000_000_000_000);
    const commissionedAt = optionalDate(body.commissioned_at);
    const nextServiceAt = optionalDate(body.next_service_at);

    const updated = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      UPDATE "PropertyTechnicalAsset"
      SET "name" = ${name},
          "category" = ${optionalText(body.category, 120)},
          "component_class" = ${optionalText(body.component_class, 120)},
          "location" = ${optionalText(body.location, 255)},
          "status" = ${status},
          "criticality" = ${criticality},
          "manufacturer" = ${optionalText(body.manufacturer, 160)},
          "model" = ${optionalText(body.model, 160)},
          "serial_number" = ${optionalText(body.serial_number, 160)},
          "installation_year" = ${installationYear},
          "commissioned_at" = ${commissionedAt},
          "technical_lifetime_years" = ${technicalLifetime},
          "economic_lifetime_years" = ${economicLifetime},
          "expected_replacement_year" = ${replacementYear},
          "condition_grade" = ${conditionGrade},
          "replacement_value" = ${replacementValue},
          "responsible_supplier" = ${optionalText(body.responsible_supplier, 200)},
          "next_service_at" = ${nextServiceAt},
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${componentId}
        AND "property_id" = ${propertyId}
        AND "company_id" = ${user.company_id}
      RETURNING *
    `);

    if (!updated[0]) return NextResponse.json({ error: "Komponenten hittades inte" }, { status: 404 });

    await writeAuditLog(user, {
      entityType: "technical_asset",
      entityId: componentId,
      action: "updated",
      metadata: { propertyId, fields: Object.keys(body).sort() },
    });

    return NextResponse.json({ component: updated[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte uppdatera komponenten";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
