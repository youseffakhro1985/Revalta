import { randomUUID } from "crypto";
import db from "@/lib/db";
import { auditScopedWhere, canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { asNumber } from "@/lib/dual-list";
import { NextResponse } from "next/server";

const action = "maintenance.plan.item";
const statuses = ["planned", "approved", "in_progress", "completed", "cancelled"] as const;
type MaintenanceStatus = (typeof statuses)[number];
type MaintenanceMetadata = {
  item_id?: string;
  property_name?: string;
  component?: string;
  measure?: string;
  planned_year?: number;
  estimated_cost?: number;
  priority?: string;
  interval_years?: number;
  status?: MaintenanceStatus;
  work_order_id?: string | null;
  work_order_number?: string | null;
  updated_at?: string;
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const [rows, logs, properties] = await Promise.all([
      user.company_id
        ? db.portfolioMaintenanceItem.findMany({
            where: { company_id: user.company_id },
            orderBy: { created_at: "asc" },
            include: { property: { select: { name: true } } },
          })
        : Promise.resolve([]),
      db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
        orderBy: { created_at: "asc" },
        select: { id: true, entity_id: true, metadata: true, created_at: true },
      }),
      db.property.findMany({
        where: tenantWhere(user),
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
    ]);

    const modernIds = new Set(rows.map((row) => row.id));
    const modern = rows.map((row) => ({
      id: row.id,
      property_id: row.property_id,
      property_name: row.property.name,
      component: row.component,
      measure: row.measure,
      planned_year: row.planned_year,
      estimated_cost: asNumber(row.estimated_cost),
      priority: row.priority,
      interval_years: row.interval_years,
      status: row.status,
      work_order_id: row.work_order_id,
      work_order_number: row.work_order_number,
      created_at: row.created_at,
      updated_at: row.updated_at,
      source: "table" as const,
    }));

    const latest = new Map<string, Record<string, unknown>>();
    for (const log of logs) {
      const metadata = (log.metadata ?? {}) as MaintenanceMetadata;
      const itemId = metadata.item_id || log.id;
      if (modernIds.has(itemId)) continue;
      const previous = latest.get(itemId) || {};
      latest.set(itemId, {
        ...previous,
        ...metadata,
        id: itemId,
        property_id: log.entity_id,
        created_at: previous.created_at || log.created_at,
        updated_at: metadata.updated_at || log.created_at,
        source: "legacy",
      });
    }

    return NextResponse.json({
      items: [...modern, ...latest.values()],
      properties,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Get maintenance plan error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Ogiltigt innehåll" }, { status: 400 });

    const propertyId = String(body.propertyId || "").trim();
    const component = String(body.component || "").trim();
    const measure = String(body.measure || "").trim();
    const plannedYear = Number(body.plannedYear);
    const estimatedCost = Number(body.estimatedCost);
    const priority = String(body.priority || "normal");
    const intervalYears = Number(body.intervalYears || 0);

    if (!propertyId || !component || !measure || !Number.isInteger(plannedYear) || plannedYear < 2020 || !Number.isFinite(estimatedCost) || estimatedCost < 0 || !Number.isInteger(intervalYears) || intervalYears < 0) {
      return NextResponse.json({ error: "Kontrollera fastighet, byggnadsdel, åtgärd, år, intervall och kostnad" }, { status: 400 });
    }
    if (component.length > 180 || measure.length > 5000) return NextResponse.json({ error: "Byggnadsdel eller åtgärdsbeskrivning är för lång" }, { status: 400 });

    const property = await db.property.findFirst({ where: { id: propertyId, ...tenantWhere(user) }, select: { id: true, name: true } });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const item = await db.portfolioMaintenanceItem.create({
      data: {
        id: randomUUID(),
        company_id: user.company_id,
        property_id: property.id,
        component,
        measure,
        planned_year: plannedYear,
        estimated_cost: estimatedCost,
        priority,
        interval_years: intervalYears,
        status: "planned",
        created_by_id: user.id,
      },
      select: { id: true },
    });

    await writeAuditLog(user, {
      entityType: "property",
      entityId: property.id,
      action,
      metadata: {
        item_id: item.id,
        property_name: property.name,
        component,
        measure,
        planned_year: plannedYear,
        estimated_cost: estimatedCost,
        priority,
        interval_years: intervalYears,
        status: "planned",
        storage: "PortfolioMaintenanceItem",
      },
    });

    return NextResponse.json({ success: true, itemId: item.id }, { status: 201 });
  } catch (error) {
    console.error("Create maintenance item error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Ogiltigt innehåll" }, { status: 400 });

    const itemId = String(body.itemId || "").trim();
    const status = String(body.status || "").trim() as MaintenanceStatus;
    const workOrderId = body.workOrderId ? String(body.workOrderId).trim() : null;
    if (!itemId || !statuses.includes(status)) return NextResponse.json({ error: "Åtgärd och giltig status krävs" }, { status: 400 });

    const modern = await db.portfolioMaintenanceItem.findFirst({
      where: { id: itemId, company_id: user.company_id },
      select: { id: true, property_id: true, work_order_id: true, work_order_number: true },
    });

    if (modern) {
      let workOrderNumber: string | null = modern.work_order_number;
      if (workOrderId) {
        const workOrder = await db.workOrder.findFirst({
          where: { id: workOrderId, company_id: user.company_id, property_id: modern.property_id },
          select: { id: true },
        });
        if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte för aktuell fastighet" }, { status: 404 });
        const rows = await db.$queryRaw<Array<{ work_order_number: string | null }>>`SELECT "work_order_number" FROM "WorkOrder" WHERE "id" = ${workOrderId} LIMIT 1`;
        workOrderNumber = rows[0]?.work_order_number ?? null;
      }

      const updateResult = await db.portfolioMaintenanceItem.updateMany({
        where: { id: modern.id, company_id: user.company_id },
        data: {
          status,
          work_order_id: workOrderId ?? modern.work_order_id,
          work_order_number: workOrderNumber,
        },
      });
      if (updateResult.count === 0) return NextResponse.json({ error: "Underhållsåtgärden hittades inte" }, { status: 404 });

      await writeAuditLog(user, {
        entityType: "property",
        entityId: modern.property_id,
        action,
        metadata: {
          item_id: modern.id,
          status,
          work_order_id: workOrderId ?? modern.work_order_id,
          work_order_number: workOrderNumber,
          updated_at: new Date().toISOString(),
          storage: "PortfolioMaintenanceItem",
        },
      });
      return NextResponse.json({ success: true });
    }

    const logs = await db.auditLog.findMany({
      where: { company_id: user.company_id, action },
      orderBy: { created_at: "asc" },
      select: { id: true, entity_id: true, metadata: true, created_at: true },
    });
    const related = logs.filter((log) => {
      const metadata = (log.metadata ?? {}) as MaintenanceMetadata;
      return log.id === itemId || metadata.item_id === itemId;
    });
    if (!related.length) return NextResponse.json({ error: "Underhållsåtgärden hittades inte" }, { status: 404 });

    const snapshot = related.reduce<MaintenanceMetadata>((current, log) => ({ ...current, ...((log.metadata ?? {}) as MaintenanceMetadata) }), {});
    const propertyId = related.at(-1)?.entity_id;
    if (!propertyId) return NextResponse.json({ error: "Underhållsåtgärden saknar fastighet" }, { status: 400 });

    let workOrderNumber: string | null = snapshot.work_order_number || null;
    if (workOrderId) {
      const workOrder = await db.workOrder.findFirst({
        where: { id: workOrderId, company_id: user.company_id, property_id: propertyId },
        select: { id: true },
      });
      if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte för aktuell fastighet" }, { status: 404 });
      const rows = await db.$queryRaw<Array<{ work_order_number: string | null }>>`SELECT "work_order_number" FROM "WorkOrder" WHERE "id" = ${workOrderId} LIMIT 1`;
      workOrderNumber = rows[0]?.work_order_number ?? null;
    }

    await writeAuditLog(user, {
      entityType: "property",
      entityId: propertyId,
      action,
      metadata: {
        ...snapshot,
        item_id: itemId,
        status,
        work_order_id: workOrderId ?? snapshot.work_order_id ?? null,
        work_order_number: workOrderNumber,
        updated_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update maintenance item error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
