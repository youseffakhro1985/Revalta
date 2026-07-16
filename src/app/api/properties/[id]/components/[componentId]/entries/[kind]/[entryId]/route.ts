import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";

const EVENT_TYPES = new Set(["installation", "commissioning", "service", "repair", "inspection", "warranty", "damage", "replacement", "shutdown", "restart"]);
const COST_TYPES = new Set(["service", "repair", "spare_part", "inspection", "contractor", "investment", "replacement", "other"]);

function optionalText(value: unknown, max: number) {
  if (value == null || value === "") return null;
  return String(value).trim().slice(0, max) || null;
}

function requiredDate(value: unknown, label: string) {
  const parsed = new Date(String(value || ""));
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} är ogiltigt`);
  return parsed;
}

function optionalDate(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error("Datumet är ogiltigt");
  return parsed;
}

function optionalDecimal(value: unknown, min: number, max: number, label: string) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${label} är ogiltigt`);
  return parsed;
}

async function context(params: Promise<{ id: string; componentId: string; kind: string; entryId: string }>) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Obehörig" }, { status: 401 }) };
  if (!user.company_id) return { error: NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 }) };
  if (!canCreateProperties(user.role)) return { error: NextResponse.json({ error: "Du saknar behörighet att korrigera komponenthistorik" }, { status: 403 }) };

  const { id: propertyId, componentId, kind, entryId } = await params;
  if (kind !== "event" && kind !== "cost") return { error: NextResponse.json({ error: "Ogiltig posttyp" }, { status: 400 }) };

  const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true } });
  if (!property) return { error: NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 }) };

  const assets = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "PropertyTechnicalAsset"
    WHERE "id" = ${componentId} AND "property_id" = ${propertyId} AND "company_id" = ${user.company_id}
    LIMIT 1
  `);
  if (!assets[0]) return { error: NextResponse.json({ error: "Komponenten hittades inte" }, { status: 404 }) };

  return { user, propertyId, componentId, kind, entryId };
}

async function validateLink(id: unknown, table: "WorkOrder" | "Project", propertyId: string, companyId: string) {
  if (!id) return null;
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM ${Prisma.raw(`"${table}"`)}
    WHERE "id" = ${String(id)} AND "property_id" = ${propertyId} AND "company_id" = ${companyId}
    LIMIT 1
  `);
  if (!rows[0]) throw new Error(table === "WorkOrder" ? "Arbetsordern är ogiltig" : "Projektet är ogiltigt");
  return rows[0].id;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; componentId: string; kind: string; entryId: string }> }) {
  const resolved = await context(params);
  if ("error" in resolved) return resolved.error;
  const { user, propertyId, componentId, kind, entryId } = resolved;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 }); }

  try {
    const workOrderId = await validateLink(body.work_order_id, "WorkOrder", propertyId, user.company_id!);
    const projectId = await validateLink(body.project_id, "Project", propertyId, user.company_id!);

    if (kind === "event") {
      const eventType = String(body.event_type || "");
      const title = String(body.title || "").trim().slice(0, 180);
      if (!EVENT_TYPES.has(eventType)) throw new Error("Ogiltig händelsetyp");
      if (title.length < 2) throw new Error("Rubriken måste innehålla minst två tecken");
      const eventDate = requiredDate(body.event_date, "Händelsedatumet");
      const nextDueAt = optionalDate(body.next_due_at);
      const meterReading = optionalDecimal(body.meter_reading, 0, 1_000_000_000_000, "Mätarställningen");

      const before = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT * FROM "ComponentLifecycleEvent"
        WHERE "id" = ${entryId} AND "technical_asset_id" = ${componentId} AND "property_id" = ${propertyId} AND "company_id" = ${user.company_id}
        LIMIT 1
      `);
      if (!before[0]) return NextResponse.json({ error: "Händelsen hittades inte" }, { status: 404 });

      const updated = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "ComponentLifecycleEvent"
        SET "event_type" = ${eventType}, "event_date" = ${eventDate}, "title" = ${title},
            "description" = ${optionalText(body.description, 4000)}, "provider" = ${optionalText(body.provider, 200)},
            "result" = ${optionalText(body.result, 2000)}, "next_due_at" = ${nextDueAt}, "meter_reading" = ${meterReading},
            "work_order_id" = ${workOrderId}, "project_id" = ${projectId}, "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${entryId} AND "technical_asset_id" = ${componentId} AND "property_id" = ${propertyId} AND "company_id" = ${user.company_id}
        RETURNING *
      `);

      const nextService = await db.$queryRaw<Array<{ next_due_at: Date | null }>>(Prisma.sql`
        SELECT MIN("next_due_at") AS "next_due_at" FROM "ComponentLifecycleEvent"
        WHERE "technical_asset_id" = ${componentId} AND "company_id" = ${user.company_id}
          AND "event_type" IN ('service', 'inspection') AND "next_due_at" IS NOT NULL
      `);
      await db.$executeRaw(Prisma.sql`
        UPDATE "PropertyTechnicalAsset" SET "next_service_at" = ${nextService[0]?.next_due_at || null}, "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${componentId} AND "company_id" = ${user.company_id}
      `);

      await writeAuditLog(user, { entityType: "component_lifecycle_event", entityId: entryId, action: "corrected", metadata: { propertyId, componentId, before: before[0], fields: Object.keys(body).sort() } });
      return NextResponse.json({ entry: updated[0] });
    }

    const costType = String(body.cost_type || "");
    if (!COST_TYPES.has(costType)) throw new Error("Ogiltig kostnadstyp");
    const amount = optionalDecimal(body.amount_ex_vat, 0, 1_000_000_000_000, "Beloppet");
    if (amount == null) throw new Error("Belopp måste anges");
    const vatRate = optionalDecimal(body.vat_rate, 0, 100, "Momssatsen");
    if (vatRate == null) throw new Error("Momssats måste anges");
    const costDate = requiredDate(body.cost_date, "Kostnadsdatumet");

    const before = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT * FROM "ComponentCostEntry"
      WHERE "id" = ${entryId} AND "technical_asset_id" = ${componentId} AND "property_id" = ${propertyId} AND "company_id" = ${user.company_id}
      LIMIT 1
    `);
    if (!before[0]) return NextResponse.json({ error: "Kostnadsposten hittades inte" }, { status: 404 });

    const updated = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      UPDATE "ComponentCostEntry"
      SET "cost_type" = ${costType}, "description" = ${optionalText(body.description, 2000)},
          "supplier" = ${optionalText(body.supplier, 200)}, "amount_ex_vat" = ${amount},
          "vat_rate" = ${vatRate}, "cost_date" = ${costDate}, "work_order_id" = ${workOrderId}, "project_id" = ${projectId}
      WHERE "id" = ${entryId} AND "technical_asset_id" = ${componentId} AND "property_id" = ${propertyId} AND "company_id" = ${user.company_id}
      RETURNING *
    `);

    await writeAuditLog(user, { entityType: "component_cost_entry", entityId: entryId, action: "corrected", metadata: { propertyId, componentId, before: before[0], fields: Object.keys(body).sort() } });
    return NextResponse.json({ entry: updated[0] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kunde inte korrigera posten" }, { status: 400 });
  }
}
