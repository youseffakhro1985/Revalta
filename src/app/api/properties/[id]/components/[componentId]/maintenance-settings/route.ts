import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser, tenantWhere } from "@/lib/current-user";

async function resolveContext(params: Promise<{ id: string; componentId: string }>) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Obehörig" }, { status: 401 }) };
  if (!user.company_id) return { error: NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 }) };
  const { id: propertyId, componentId } = await params;
  const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true } });
  if (!property) return { error: NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 }) };
  return { user, propertyId, componentId };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; componentId: string }> }) {
  const context = await resolveContext(params);
  if ("error" in context) return context.error;
  const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT "id", "name", "next_service_at", "service_interval_months", "service_lead_days",
           "auto_create_service_work_orders", "criticality", "status"
    FROM "PropertyTechnicalAsset"
    WHERE "id" = ${context.componentId} AND "property_id" = ${context.propertyId} AND "company_id" = ${context.user.company_id}
    LIMIT 1
  `);
  if (!rows[0]) return NextResponse.json({ error: "Komponenten hittades inte" }, { status: 404 });
  return NextResponse.json({ settings: rows[0] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; componentId: string }> }) {
  const context = await resolveContext(params);
  if ("error" in context) return context.error;
  if (!canCreateProperties(context.user.role)) return NextResponse.json({ error: "Du saknar behörighet att ändra underhållsinställningar" }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const interval = Number(body.serviceIntervalMonths);
  const leadDays = Number(body.serviceLeadDays);
  const enabled = body.autoCreateServiceWorkOrders === true;
  const nextServiceAt = body.nextServiceAt ? new Date(String(body.nextServiceAt)) : null;

  if (!Number.isInteger(interval) || interval < 1 || interval > 120) return NextResponse.json({ error: "Serviceintervallet måste vara 1–120 månader" }, { status: 400 });
  if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 365) return NextResponse.json({ error: "Framförhållningen måste vara 0–365 dagar" }, { status: 400 });
  if (nextServiceAt && Number.isNaN(nextServiceAt.getTime())) return NextResponse.json({ error: "Ogiltigt servicedatum" }, { status: 400 });

  const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    UPDATE "PropertyTechnicalAsset"
    SET "next_service_at" = ${nextServiceAt},
        "service_interval_months" = ${interval},
        "service_lead_days" = ${leadDays},
        "auto_create_service_work_orders" = ${enabled},
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${context.componentId} AND "property_id" = ${context.propertyId} AND "company_id" = ${context.user.company_id}
    RETURNING "id", "name", "next_service_at", "service_interval_months", "service_lead_days", "auto_create_service_work_orders"
  `);
  if (!rows[0]) return NextResponse.json({ error: "Komponenten hittades inte" }, { status: 404 });

  await writeAuditLog(context.user, {
    entityType: "technical_asset",
    entityId: context.componentId,
    action: "maintenance.settings_updated",
    metadata: { propertyId: context.propertyId, serviceIntervalMonths: interval, serviceLeadDays: leadDays, autoCreateServiceWorkOrders: enabled, nextServiceAt: nextServiceAt?.toISOString() ?? null },
  });
  return NextResponse.json({ settings: rows[0] });
}
