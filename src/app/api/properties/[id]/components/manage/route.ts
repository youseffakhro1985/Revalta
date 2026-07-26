import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser, tenantWhere } from "@/lib/current-user";

const eventTypes = new Set(["installation", "commissioning", "service", "repair", "inspection", "warranty", "damage", "replacement", "shutdown", "restart"]);
const costTypes = new Set(["service", "repair", "spare_part", "inspection", "contractor", "investment", "replacement", "other"]);
const writableRoles = new Set(["owner", "admin", "manager", "property_manager", "technical_manager"]);

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function optionalInteger(value: unknown, min: number, max: number) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`Värdet måste vara ett heltal mellan ${min} och ${max}`);
  return parsed;
}

function optionalNumber(value: unknown, min = 0) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) throw new Error("Beloppet måste vara ett giltigt positivt tal");
  return parsed;
}

function dateValue(value: unknown, required = false) {
  if (!value) {
    if (required) throw new Error("Datum måste anges");
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error("Datumet är ogiltigt");
  return parsed;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!writableRoles.has(user.role)) return NextResponse.json({ error: "Du saknar behörighet att ändra komponentregistret" }, { status: 403 });

  const { id: propertyId } = await params;
  const property = await db.property.findFirst({ where: { id: propertyId, deleted_at: null, ...tenantWhere(user) }, select: { id: true } });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  try {
    const body = await request.json();
    const action = String(body.action || "");
    const assetId = String(body.assetId || "");
    if (!assetId) return NextResponse.json({ error: "Välj en komponent" }, { status: 400 });

    const assets = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "PropertyTechnicalAsset"
      WHERE "id" = ${assetId} AND "property_id" = ${propertyId} AND "company_id" = ${user.company_id}
      LIMIT 1
    `);
    if (!assets[0]) return NextResponse.json({ error: "Komponenten hittades inte" }, { status: 404 });

    if (action === "update") {
      const installationYear = optionalInteger(body.installationYear, 1800, 2300);
      const technicalLifetime = optionalInteger(body.technicalLifetimeYears, 1, 300);
      const economicLifetime = optionalInteger(body.economicLifetimeYears, 1, 300);
      const replacementYear = optionalInteger(body.expectedReplacementYear, 1800, 2300);
      const conditionGrade = optionalInteger(body.conditionGrade, 1, 5);
      const replacementValue = optionalNumber(body.replacementValue);
      const commissionedAt = dateValue(body.commissionedAt);

      await db.$executeRaw(Prisma.sql`
        UPDATE "PropertyTechnicalAsset" SET
          "component_class" = ${optionalText(body.componentClass)},
          "commissioned_at" = ${commissionedAt},
          "installation_year" = ${installationYear},
          "technical_lifetime_years" = ${technicalLifetime},
          "economic_lifetime_years" = ${economicLifetime},
          "expected_replacement_year" = ${replacementYear},
          "condition_grade" = ${conditionGrade},
          "replacement_value" = ${replacementValue},
          "responsible_supplier" = ${optionalText(body.responsibleSupplier)},
          "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${assetId} AND "property_id" = ${propertyId} AND "company_id" = ${user.company_id}
      `);
      await db.auditLog.create({ data: { company_id: user.company_id, actor_user_id: user.id, entity_type: "component", entity_id: assetId, action: "component.updated", metadata: body } });
      return NextResponse.json({ success: true });
    }

    if (action === "event") {
      const eventType = String(body.eventType || "");
      if (!eventTypes.has(eventType)) return NextResponse.json({ error: "Ogiltig händelsetyp" }, { status: 400 });
      const title = String(body.title || "").trim();
      if (!title) return NextResponse.json({ error: "Rubrik måste anges" }, { status: 400 });
      const eventId = randomUUID();
      await db.$executeRaw(Prisma.sql`
        INSERT INTO "ComponentLifecycleEvent" (
          "id", "company_id", "property_id", "technical_asset_id", "created_by_id", "event_type", "event_date", "title", "description", "provider", "result", "next_due_at", "meter_reading", "updated_at"
        ) VALUES (
          ${eventId}, ${user.company_id}, ${propertyId}, ${assetId}, ${user.id}, ${eventType}, ${dateValue(body.eventDate, true)}, ${title}, ${optionalText(body.description)}, ${optionalText(body.provider)}, ${optionalText(body.result)}, ${dateValue(body.nextDueAt)}, ${optionalNumber(body.meterReading)}, CURRENT_TIMESTAMP
        )
      `);
      await db.auditLog.create({ data: { company_id: user.company_id, actor_user_id: user.id, entity_type: "component_event", entity_id: eventId, action: "component.event.created", metadata: { assetId, eventType, title } } });
      return NextResponse.json({ success: true, id: eventId });
    }

    if (action === "cost") {
      const costType = String(body.costType || "");
      if (!costTypes.has(costType)) return NextResponse.json({ error: "Ogiltig kostnadstyp" }, { status: 400 });
      const amount = optionalNumber(body.amountExVat);
      if (amount == null) return NextResponse.json({ error: "Belopp exklusive moms måste anges" }, { status: 400 });
      const vatRate = optionalNumber(body.vatRate) ?? 25;
      if (vatRate > 100) return NextResponse.json({ error: "Momssatsen får inte överstiga 100 procent" }, { status: 400 });
      const costId = randomUUID();
      await db.$executeRaw(Prisma.sql`
        INSERT INTO "ComponentCostEntry" (
          "id", "company_id", "property_id", "technical_asset_id", "created_by_id", "cost_type", "description", "supplier", "amount_ex_vat", "vat_rate", "cost_date"
        ) VALUES (
          ${costId}, ${user.company_id}, ${propertyId}, ${assetId}, ${user.id}, ${costType}, ${optionalText(body.description)}, ${optionalText(body.supplier)}, ${amount}, ${vatRate}, ${dateValue(body.costDate, true)}
        )
      `);
      await db.auditLog.create({ data: { company_id: user.company_id, actor_user_id: user.id, entity_type: "component_cost", entity_id: costId, action: "component.cost.created", metadata: { assetId, costType, amount, vatRate } } });
      return NextResponse.json({ success: true, id: costId });
    }

    return NextResponse.json({ error: "Ogiltig åtgärd" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kunde inte spara komponentuppgifterna" }, { status: 400 });
  }
}
