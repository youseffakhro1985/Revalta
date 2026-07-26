import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";

const EVENT_TYPES = new Set(["installation", "commissioning", "service", "repair", "inspection", "warranty", "damage", "replacement", "shutdown", "restart"]);
const COST_TYPES = new Set(["service", "repair", "spare_part", "inspection", "contractor", "investment", "replacement", "other"]);

function text(value: unknown, max = 1000) {
  if (value == null || value === "") return null;
  return String(value).trim().slice(0, max) || null;
}

function requiredText(value: unknown, label: string, max = 180) {
  const result = text(value, max);
  if (!result) throw new Error(`${label} måste anges`);
  return result;
}

function date(value: unknown, label: string, required = true) {
  if (value == null || value === "") {
    if (required) throw new Error(`${label} måste anges`);
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} är ogiltigt`);
  return parsed;
}

function decimal(value: unknown, label: string, min = 0, max = 1_000_000_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${label} är ogiltigt`);
  return parsed;
}

async function optionalLink(companyId: string, propertyId: string, kind: "work_order" | "project", id: unknown) {
  const value = text(id, 80);
  if (!value) return null;
  if (kind === "work_order") {
    const row = await db.workOrder.findFirst({ where: { deleted_at: null, id: value, company_id: companyId, property_id: propertyId }, select: { id: true } });
    if (!row) throw new Error("Arbetsordern hittades inte i denna fastighet");
  } else {
    const row = await db.project.findFirst({ where: { deleted_at: null, id: value, company_id: companyId, property_id: propertyId }, select: { id: true } });
    if (!row) throw new Error("Projektet hittades inte i denna fastighet");
  }
  return value;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; componentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canCreateProperties(user.role)) return NextResponse.json({ error: "Du saknar behörighet att registrera komponenthistorik" }, { status: 403 });

  const { id: propertyId, componentId } = await params;
  const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true } });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  const assets = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "PropertyTechnicalAsset"
    WHERE "id" = ${componentId} AND "property_id" = ${propertyId} AND "company_id" = ${user.company_id}
    LIMIT 1
  `);
  if (!assets[0]) return NextResponse.json({ error: "Komponenten hittades inte" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 }); }

  try {
    const action = String(body.action || "");
    const workOrderId = await optionalLink(user.company_id, propertyId, "work_order", body.work_order_id);
    const projectId = await optionalLink(user.company_id, propertyId, "project", body.project_id);

    if (action === "event") {
      const eventType = String(body.event_type || "");
      if (!EVENT_TYPES.has(eventType)) throw new Error("Ogiltig händelsetyp");
      const eventDate = date(body.event_date, "Händelsedatum")!;
      const nextDueAt = date(body.next_due_at, "Nästa datum", false);
      const meterReading = body.meter_reading == null || body.meter_reading === "" ? null : decimal(body.meter_reading, "Mätarställning");
      const id = crypto.randomUUID();

      const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO "ComponentLifecycleEvent"
          ("id", "company_id", "property_id", "technical_asset_id", "created_by_id", "work_order_id", "project_id", "event_type", "event_date", "title", "description", "provider", "result", "next_due_at", "meter_reading")
        VALUES
          (${id}, ${user.company_id}, ${propertyId}, ${componentId}, ${user.id}, ${workOrderId}, ${projectId}, ${eventType}, ${eventDate},
           ${requiredText(body.title, "Rubrik")}, ${text(body.description, 4000)}, ${text(body.provider, 200)}, ${text(body.result, 2000)}, ${nextDueAt}, ${meterReading})
        RETURNING *
      `);

      if (nextDueAt && (eventType === "service" || eventType === "inspection")) {
        await db.$executeRaw(Prisma.sql`
          UPDATE "PropertyTechnicalAsset" SET "next_service_at" = ${nextDueAt}, "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${componentId} AND "company_id" = ${user.company_id}
        `);
      }

      await writeAuditLog(user, { entityType: "component_lifecycle_event", entityId: id, action: "created", metadata: { propertyId, componentId, eventType, workOrderId, projectId } });
      return NextResponse.json({ event: rows[0] }, { status: 201 });
    }

    if (action === "cost") {
      const costType = String(body.cost_type || "");
      if (!COST_TYPES.has(costType)) throw new Error("Ogiltig kostnadstyp");
      const amount = decimal(body.amount_ex_vat, "Belopp exklusive moms");
      const vatRate = decimal(body.vat_rate ?? 25, "Momssats", 0, 100);
      const costDate = date(body.cost_date, "Kostnadsdatum")!;
      const lifecycleEventId = text(body.lifecycle_event_id, 80);
      if (lifecycleEventId) {
        const linked = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "ComponentLifecycleEvent"
          WHERE "id" = ${lifecycleEventId} AND "technical_asset_id" = ${componentId} AND "company_id" = ${user.company_id}
          LIMIT 1
        `);
        if (!linked[0]) throw new Error("Den valda livscykelhändelsen hittades inte");
      }
      const id = crypto.randomUUID();
      const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO "ComponentCostEntry"
          ("id", "company_id", "property_id", "technical_asset_id", "lifecycle_event_id", "work_order_id", "project_id", "created_by_id", "cost_type", "description", "supplier", "amount_ex_vat", "vat_rate", "cost_date")
        VALUES
          (${id}, ${user.company_id}, ${propertyId}, ${componentId}, ${lifecycleEventId}, ${workOrderId}, ${projectId}, ${user.id}, ${costType},
           ${text(body.description, 2000)}, ${text(body.supplier, 200)}, ${amount}, ${vatRate}, ${costDate})
        RETURNING *
      `);
      await writeAuditLog(user, { entityType: "component_cost_entry", entityId: id, action: "created", metadata: { propertyId, componentId, costType, amount, vatRate, workOrderId, projectId } });
      return NextResponse.json({ cost: rows[0] }, { status: 201 });
    }

    return NextResponse.json({ error: "Okänd åtgärd" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kunde inte registrera uppgifterna" }, { status: 400 });
  }
}
