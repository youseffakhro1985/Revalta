import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import {
  canCreateProperties,
  canViewFinanceData,
  canViewOperations,
  getCurrentUser,
  tenantWhere,
} from "@/lib/current-user";

const assetCategories = new Set(["elevator", "ventilation", "heating", "electricity", "water", "fire", "access", "other"]);
const criticalities = new Set(["low", "normal", "high", "critical"]);
const assetStatuses = new Set(["active", "service_due", "out_of_service", "decommissioned"]);
const inspectionStatuses = new Set(["planned", "completed", "approved", "remark", "overdue"]);
const agreementStatuses = new Set(["active", "expired", "cancelled"]);

function text(value: unknown, max = 500) {
  const result = value == null ? "" : String(value).trim();
  return result.slice(0, max);
}

function nullableText(value: unknown, max = 500) {
  const result = text(value, max);
  return result || null;
}

function nullableDate(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function nullableNumber(value: unknown) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function resolveProperty(id: string, user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user) return null;
  return db.property.findFirst({ where: { id, deleted_at: null, ...tenantWhere(user) }, select: { id: true } });
}

async function validateBuilding(buildingId: string | null, propertyId: string) {
  if (!buildingId) return true;
  const building = await db.building.findFirst({ where: { id: buildingId, property_id: propertyId }, select: { id: true } });
  return Boolean(building);
}

async function validateAsset(assetId: string | null, propertyId: string, companyId: string) {
  if (!assetId) return true;
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "PropertyTechnicalAsset"
    WHERE "id" = ${assetId} AND "property_id" = ${propertyId} AND "company_id" = ${companyId}
    LIMIT 1
  `);
  return rows.length === 1;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const property = await db.property.findFirst({
    where: { id, deleted_at: null, ...tenantWhere(user) },
    include: {
      buildings: { orderBy: { name: "asc" }, include: { _count: { select: { units: true } } } },
      units: { orderBy: [{ unit_type: "asc" }, { designation: "asc" }], include: { building: { select: { id: true, name: true } } } },
      work_orders: {
        where: { deleted_at: null },
        orderBy: { updated_at: "desc" }, take: 12,
        select: { id: true, title: true, status: true, priority: true, scheduled_end: true, actual_cost: true, updated_at: true },
      },
      projects: {
        where: { deleted_at: null },
        orderBy: { updated_at: "desc" }, take: 12,
        select: { id: true, name: true, status: true, risk: true, budget: true, forecast: true, actual: true, end_date: true, updated_at: true },
      },
      _count: {
        select: {
          tickets: { where: { deleted_at: null } },
          buildings: true,
          units: true,
          work_orders: { where: { deleted_at: null } },
          projects: { where: { deleted_at: null } },
        },
      },
    },
  });

  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  const companyId = user.company_id;
  const [entrances, assets, warranties, inspections, agreements] = await Promise.all([
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT e.*, b."name" AS "building_name"
      FROM "PropertyEntrance" e
      LEFT JOIN "Building" b ON b."id" = e."building_id"
      WHERE e."company_id" = ${companyId} AND e."property_id" = ${id}
      ORDER BY e."name" ASC
    `),
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT a.*, b."name" AS "building_name"
      FROM "PropertyTechnicalAsset" a
      LEFT JOIN "Building" b ON b."id" = a."building_id"
      WHERE a."company_id" = ${companyId} AND a."property_id" = ${id}
      ORDER BY CASE a."criticality" WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
               a."next_service_at" ASC NULLS LAST, a."name" ASC
    `),
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT w.*, a."name" AS "technical_asset_name"
      FROM "PropertyWarranty" w
      LEFT JOIN "PropertyTechnicalAsset" a ON a."id" = w."technical_asset_id"
      WHERE w."company_id" = ${companyId} AND w."property_id" = ${id}
      ORDER BY w."expires_at" ASC NULLS LAST, w."title" ASC
    `),
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT i.*, a."name" AS "technical_asset_name"
      FROM "PropertyInspection" i
      LEFT JOIN "PropertyTechnicalAsset" a ON a."id" = i."technical_asset_id"
      WHERE i."company_id" = ${companyId} AND i."property_id" = ${id}
      ORDER BY COALESCE(i."next_due_at", i."scheduled_at") ASC NULLS LAST, i."title" ASC
    `),
    db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT s.*, a."name" AS "technical_asset_name",
             s."cost_amount"::double precision AS "cost_amount"
      FROM "PropertyServiceAgreement" s
      LEFT JOIN "PropertyTechnicalAsset" a ON a."id" = s."technical_asset_id"
      WHERE s."company_id" = ${companyId} AND s."property_id" = ${id}
      ORDER BY s."ends_at" ASC NULLS LAST, s."supplier" ASC
    `),
  ]);

  const now = Date.now();
  const inDays = (value: unknown, days: number) => {
    if (!value) return false;
    const time = new Date(String(value)).getTime();
    return Number.isFinite(time) && time >= now && time <= now + days * 86_400_000;
  };

  const metrics = {
    entrances: entrances.length,
    technicalAssets: assets.length,
    criticalAssets: assets.filter((item) => item.criticality === "critical" || item.status === "out_of_service").length,
    serviceDue90Days: assets.filter((item) => inDays(item.next_service_at, 90) || item.status === "service_due").length,
    warrantiesExpiring180Days: warranties.filter((item) => inDays(item.expires_at, 180)).length,
    inspectionsDue90Days: inspections.filter((item) => inDays(item.next_due_at || item.scheduled_at, 90) || item.status === "overdue").length,
    agreementsEnding180Days: agreements.filter((item) => inDays(item.ends_at, 180)).length,
  };

  const includeFinance = canViewFinanceData(user.role);
  const safeProperty = includeFinance
    ? property
    : {
        ...property,
        work_orders: property.work_orders.map((order) => ({ ...order, actual_cost: null })),
        projects: property.projects.map((project) => ({
          ...project,
          budget: null,
          forecast: null,
          actual: null,
        })),
      };
  const safeAgreements = includeFinance
    ? agreements
    : agreements.map((item) => ({ ...item, cost_amount: null }));

  return NextResponse.json({
    property: safeProperty,
    entrances,
    assets,
    warranties,
    inspections,
    agreements: safeAgreements,
    metrics,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canCreateProperties(user.role) && !canViewOperations(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  }
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id: propertyId } = await params;
  const property = await resolveProperty(propertyId, user);
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  const body = await request.json();
  const action = text(body.action, 80);
  const recordId = nullableText(body.recordId, 80) || crypto.randomUUID();
  const companyId = user.company_id;
  const buildingId = nullableText(body.buildingId, 80);
  const technicalAssetId = nullableText(body.technicalAssetId, 80);

  if (!(await validateBuilding(buildingId, propertyId))) return NextResponse.json({ error: "Byggnaden tillhör inte fastigheten" }, { status: 400 });
  if (!(await validateAsset(technicalAssetId, propertyId, companyId))) return NextResponse.json({ error: "Installationen tillhör inte fastigheten" }, { status: 400 });

  if (action === "entrance.save") {
    const name = text(body.name, 160);
    if (!name) return NextResponse.json({ error: "Namn på entré eller trapphus krävs" }, { status: 400 });
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "PropertyEntrance" ("id", "company_id", "property_id", "building_id", "name", "address", "floors", "accessibility", "status", "notes")
      VALUES (${recordId}, ${companyId}, ${propertyId}, ${buildingId}, ${name}, ${nullableText(body.address, 200)}, ${nullableNumber(body.floors)}, ${nullableText(body.accessibility, 300)}, ${text(body.status, 40) || "active"}, ${nullableText(body.notes, 2000)})
      ON CONFLICT ("id") DO UPDATE SET "building_id" = EXCLUDED."building_id", "name" = EXCLUDED."name", "address" = EXCLUDED."address", "floors" = EXCLUDED."floors", "accessibility" = EXCLUDED."accessibility", "status" = EXCLUDED."status", "notes" = EXCLUDED."notes", "updated_at" = CURRENT_TIMESTAMP
      WHERE "PropertyEntrance"."company_id" = ${companyId} AND "PropertyEntrance"."property_id" = ${propertyId}
    `);
  } else if (action === "asset.save") {
    const name = text(body.name, 160);
    const category = text(body.category, 40);
    const criticality = text(body.criticality, 40) || "normal";
    const status = text(body.status, 40) || "active";
    if (!name || !assetCategories.has(category) || !criticalities.has(criticality) || !assetStatuses.has(status)) return NextResponse.json({ error: "Kontrollera installationens namn, kategori, kritikalitet och status" }, { status: 400 });
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "PropertyTechnicalAsset" ("id", "company_id", "property_id", "building_id", "category", "name", "manufacturer", "model", "serial_number", "location", "installed_at", "last_service_at", "next_service_at", "service_provider", "criticality", "status", "notes")
      VALUES (${recordId}, ${companyId}, ${propertyId}, ${buildingId}, ${category}, ${name}, ${nullableText(body.manufacturer, 160)}, ${nullableText(body.model, 160)}, ${nullableText(body.serialNumber, 160)}, ${nullableText(body.location, 200)}, ${nullableDate(body.installedAt)}, ${nullableDate(body.lastServiceAt)}, ${nullableDate(body.nextServiceAt)}, ${nullableText(body.serviceProvider, 200)}, ${criticality}, ${status}, ${nullableText(body.notes, 2000)})
      ON CONFLICT ("id") DO UPDATE SET "building_id" = EXCLUDED."building_id", "category" = EXCLUDED."category", "name" = EXCLUDED."name", "manufacturer" = EXCLUDED."manufacturer", "model" = EXCLUDED."model", "serial_number" = EXCLUDED."serial_number", "location" = EXCLUDED."location", "installed_at" = EXCLUDED."installed_at", "last_service_at" = EXCLUDED."last_service_at", "next_service_at" = EXCLUDED."next_service_at", "service_provider" = EXCLUDED."service_provider", "criticality" = EXCLUDED."criticality", "status" = EXCLUDED."status", "notes" = EXCLUDED."notes", "updated_at" = CURRENT_TIMESTAMP
      WHERE "PropertyTechnicalAsset"."company_id" = ${companyId} AND "PropertyTechnicalAsset"."property_id" = ${propertyId}
    `);
  } else if (action === "warranty.save") {
    const title = text(body.title, 180);
    if (!title) return NextResponse.json({ error: "Garantins titel krävs" }, { status: 400 });
    const startsAt = nullableDate(body.startsAt); const expiresAt = nullableDate(body.expiresAt);
    if (startsAt && expiresAt && expiresAt < startsAt) return NextResponse.json({ error: "Garantins slutdatum kan inte vara före startdatum" }, { status: 400 });
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "PropertyWarranty" ("id", "company_id", "property_id", "technical_asset_id", "title", "supplier", "scope", "starts_at", "expires_at", "contact_name", "contact_email", "contact_phone", "document_url", "status")
      VALUES (${recordId}, ${companyId}, ${propertyId}, ${technicalAssetId}, ${title}, ${nullableText(body.supplier, 200)}, ${nullableText(body.scope, 1000)}, ${startsAt}, ${expiresAt}, ${nullableText(body.contactName, 160)}, ${nullableText(body.contactEmail, 200)}, ${nullableText(body.contactPhone, 80)}, ${nullableText(body.documentUrl, 1000)}, ${text(body.status, 40) || "active"})
      ON CONFLICT ("id") DO UPDATE SET "technical_asset_id" = EXCLUDED."technical_asset_id", "title" = EXCLUDED."title", "supplier" = EXCLUDED."supplier", "scope" = EXCLUDED."scope", "starts_at" = EXCLUDED."starts_at", "expires_at" = EXCLUDED."expires_at", "contact_name" = EXCLUDED."contact_name", "contact_email" = EXCLUDED."contact_email", "contact_phone" = EXCLUDED."contact_phone", "document_url" = EXCLUDED."document_url", "status" = EXCLUDED."status", "updated_at" = CURRENT_TIMESTAMP
      WHERE "PropertyWarranty"."company_id" = ${companyId} AND "PropertyWarranty"."property_id" = ${propertyId}
    `);
  } else if (action === "inspection.save") {
    const title = text(body.title, 180); const inspectionType = text(body.inspectionType, 100);
    const status = text(body.status, 40) || "planned";
    if (!title || !inspectionType || !inspectionStatuses.has(status)) return NextResponse.json({ error: "Besiktningens typ, titel och status krävs" }, { status: 400 });
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "PropertyInspection" ("id", "company_id", "property_id", "technical_asset_id", "inspection_type", "title", "scheduled_at", "performed_at", "next_due_at", "provider", "contact_name", "result", "summary", "document_url", "status")
      VALUES (${recordId}, ${companyId}, ${propertyId}, ${technicalAssetId}, ${inspectionType}, ${title}, ${nullableDate(body.scheduledAt)}, ${nullableDate(body.performedAt)}, ${nullableDate(body.nextDueAt)}, ${nullableText(body.provider, 200)}, ${nullableText(body.contactName, 160)}, ${nullableText(body.result, 300)}, ${nullableText(body.summary, 2000)}, ${nullableText(body.documentUrl, 1000)}, ${status})
      ON CONFLICT ("id") DO UPDATE SET "technical_asset_id" = EXCLUDED."technical_asset_id", "inspection_type" = EXCLUDED."inspection_type", "title" = EXCLUDED."title", "scheduled_at" = EXCLUDED."scheduled_at", "performed_at" = EXCLUDED."performed_at", "next_due_at" = EXCLUDED."next_due_at", "provider" = EXCLUDED."provider", "contact_name" = EXCLUDED."contact_name", "result" = EXCLUDED."result", "summary" = EXCLUDED."summary", "document_url" = EXCLUDED."document_url", "status" = EXCLUDED."status", "updated_at" = CURRENT_TIMESTAMP
      WHERE "PropertyInspection"."company_id" = ${companyId} AND "PropertyInspection"."property_id" = ${propertyId}
    `);
  } else if (action === "agreement.save") {
    const supplier = text(body.supplier, 200); const serviceArea = text(body.serviceArea, 180);
    const status = text(body.status, 40) || "active";
    const startsAt = nullableDate(body.startsAt); const endsAt = nullableDate(body.endsAt);
    if (!supplier || !serviceArea || !agreementStatuses.has(status)) return NextResponse.json({ error: "Leverantör, tjänsteområde och status krävs" }, { status: 400 });
    if (startsAt && endsAt && endsAt < startsAt) return NextResponse.json({ error: "Avtalets slutdatum kan inte vara före startdatum" }, { status: 400 });
    const costAmount = nullableNumber(body.costAmount);
    if (costAmount != null && costAmount < 0) return NextResponse.json({ error: "Avtalskostnaden kan inte vara negativ" }, { status: 400 });
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "PropertyServiceAgreement" ("id", "company_id", "property_id", "technical_asset_id", "supplier", "agreement_number", "service_area", "starts_at", "ends_at", "notice_period_months", "cost_amount", "cost_interval", "contact_name", "contact_email", "contact_phone", "document_url", "status")
      VALUES (${recordId}, ${companyId}, ${propertyId}, ${technicalAssetId}, ${supplier}, ${nullableText(body.agreementNumber, 120)}, ${serviceArea}, ${startsAt}, ${endsAt}, ${nullableNumber(body.noticePeriodMonths)}, ${costAmount}, ${nullableText(body.costInterval, 40)}, ${nullableText(body.contactName, 160)}, ${nullableText(body.contactEmail, 200)}, ${nullableText(body.contactPhone, 80)}, ${nullableText(body.documentUrl, 1000)}, ${status})
      ON CONFLICT ("id") DO UPDATE SET "technical_asset_id" = EXCLUDED."technical_asset_id", "supplier" = EXCLUDED."supplier", "agreement_number" = EXCLUDED."agreement_number", "service_area" = EXCLUDED."service_area", "starts_at" = EXCLUDED."starts_at", "ends_at" = EXCLUDED."ends_at", "notice_period_months" = EXCLUDED."notice_period_months", "cost_amount" = EXCLUDED."cost_amount", "cost_interval" = EXCLUDED."cost_interval", "contact_name" = EXCLUDED."contact_name", "contact_email" = EXCLUDED."contact_email", "contact_phone" = EXCLUDED."contact_phone", "document_url" = EXCLUDED."document_url", "status" = EXCLUDED."status", "updated_at" = CURRENT_TIMESTAMP
      WHERE "PropertyServiceAgreement"."company_id" = ${companyId} AND "PropertyServiceAgreement"."property_id" = ${propertyId}
    `);
  } else {
    return NextResponse.json({ error: "Åtgärden stöds inte" }, { status: 400 });
  }

  await writeAuditLog(user, { entityType: "property", entityId: propertyId, action: `property_card.${action}`, metadata: { recordId } });
  return NextResponse.json({ success: true, id: recordId });
}
