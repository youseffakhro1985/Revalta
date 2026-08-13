import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import db from "@/lib/db";
import {
  auditScopedWhere,
  canManageTickets,
  canManageWorkOrderFinance,
  canViewFinanceData,
  canViewOperations,
  getCurrentUser,
  tenantWhere,
} from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { asNumber, loadLegacyRows } from "@/lib/dual-list";
import { sqlSoftDeleteGuard } from "@/lib/soft-delete-compat";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/maintenance" });

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
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa underhållsplanen" }, { status: 403 });
    }

    const includeFinance = canViewFinanceData(user.role);
    const [rows, logs, properties] = await Promise.all([
      user.company_id
        ? db.portfolioMaintenanceItem.findMany({
            where: { company_id: user.company_id, property: { deleted_at: null } },
            orderBy: { created_at: "asc" },
            include: { property: { select: { name: true } } },
            take: 2000,
          })
        : Promise.resolve([]),
      loadLegacyRows(() => db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
        orderBy: { created_at: "asc" },
        select: { id: true, entity_id: true, metadata: true, created_at: true },
        // Matches the cap used by every sibling "legacy audit rows" read in this
        // module family (rent-notices, energy, budget, calendar, imd-readings, etc.).
        take: 500,
      })),
      db.property.findMany({
        where: { deleted_at: null, ...tenantWhere(user) },
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, city: true },
      }),
    ]);

    const modernIds = new Set(rows.map((row) => row.id));
    const activePropertyIds = new Set(properties.map((property) => property.id));
    const modern = rows.map((row) => ({
      id: row.id,
      property_id: row.property_id,
      property_name: row.property.name,
      component: row.component,
      measure: row.measure,
      planned_year: row.planned_year,
      estimated_cost: includeFinance ? asNumber(row.estimated_cost) : null,
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
      if (log.entity_id && !activePropertyIds.has(log.entity_id)) continue;
      const metadata = (log.metadata ?? {}) as MaintenanceMetadata;
      const itemId = metadata.item_id || log.id;
      if (modernIds.has(itemId)) continue;
      const previous = latest.get(itemId) || {};
      const next = {
        ...previous,
        ...metadata,
        id: itemId,
        property_id: log.entity_id,
        created_at: previous.created_at || log.created_at,
        updated_at: metadata.updated_at || log.created_at,
        source: "legacy",
      };
      if (!includeFinance) next.estimated_cost = undefined;
      latest.set(itemId, next);
    }

    return NextResponse.json({
      items: [...modern, ...latest.values()],
      properties,
      permissions: {
        canManage: canViewOperations(user.role),
        canViewFinance: includeFinance,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logger.error("Get maintenance plan error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canViewOperations(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
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

    if (!canManageWorkOrderFinance(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att skapa underhållsposter med kostnad" }, { status: 403 });
    }
    if (!propertyId || !component || !measure || !Number.isInteger(plannedYear) || plannedYear < 2020 || !Number.isFinite(estimatedCost) || estimatedCost < 0 || !Number.isInteger(intervalYears) || intervalYears < 0) {
      return NextResponse.json({ error: "Kontrollera fastighet, byggnadsdel, åtgärd, år, intervall och kostnad" }, { status: 400 });
    }
    if (component.length > 180 || measure.length > 5000) return NextResponse.json({ error: "Byggnadsdel eller åtgärdsbeskrivning är för lång" }, { status: 400 });

    const property = await db.property.findFirst({ where: { id: propertyId, deleted_at: null, ...tenantWhere(user) }, select: { id: true, name: true } });
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
    logger.error("Create maintenance item error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canViewOperations(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Ogiltigt innehåll" }, { status: 400 });

    const itemId = String(body.itemId || body.id || "").trim();
    if (!itemId) return NextResponse.json({ error: "Åtgärds-id krävs" }, { status: 400 });

    const hasStatus = body.status !== undefined && body.status !== null && String(body.status).trim() !== "";
    const status = (hasStatus ? String(body.status).trim() : "") as MaintenanceStatus;
    if (hasStatus && !statuses.includes(status)) {
      return NextResponse.json({ error: "Giltig status krävs" }, { status: 400 });
    }

    const fieldKeys = ["component", "measure", "plannedYear", "estimatedCost", "priority", "intervalYears"] as const;
    const hasFieldUpdate = fieldKeys.some((key) => body[key] !== undefined);
    const workOrderId = body.workOrderId ? String(body.workOrderId).trim() : null;

    if (!hasStatus && !hasFieldUpdate && !workOrderId) {
      return NextResponse.json({ error: "Status eller fält att uppdatera krävs" }, { status: 400 });
    }

    const modern = await db.portfolioMaintenanceItem.findFirst({
      where: { id: itemId, company_id: user.company_id, property: { deleted_at: null } },
      select: {
        id: true,
        property_id: true,
        component: true,
        measure: true,
        planned_year: true,
        estimated_cost: true,
        priority: true,
        interval_years: true,
        status: true,
        work_order_id: true,
        work_order_number: true,
      },
    });

    if (!modern) {
      const orphaned = await db.portfolioMaintenanceItem.findFirst({
        where: { id: itemId, company_id: user.company_id },
        select: { id: true },
      });
      if (orphaned) {
        return NextResponse.json({ error: "Underhållsåtgärden hittades inte" }, { status: 404 });
      }

      const logs = await loadLegacyRows(() => db.auditLog.findMany({
        where: { ...auditScopedWhere(user), action },
        select: { id: true, metadata: true },
        take: 1000,
      }));
      const legacy = logs.some((log) => {
        const metadata = (log.metadata ?? {}) as MaintenanceMetadata;
        return metadata.item_id === itemId || log.id === itemId;
      });
      if (legacy) {
        return NextResponse.json({
          error: "Underhållsåtgärden finns kvar i äldre lagring. Kör backfill till PortfolioMaintenanceItem innan den kan uppdateras.",
        }, { status: 409 });
      }

      return NextResponse.json({ error: "Underhållsåtgärden hittades inte" }, { status: 404 });
    }

    let component = modern.component;
    let measure = modern.measure;
    let plannedYear = modern.planned_year;
    let estimatedCost = asNumber(modern.estimated_cost);
    let priority = modern.priority;
    let intervalYears = modern.interval_years;
    const nextStatus = hasStatus ? status : (modern.status as MaintenanceStatus);

    if (hasFieldUpdate) {
      if (body.estimatedCost !== undefined && !canManageWorkOrderFinance(user.role)) {
        return NextResponse.json({ error: "Du saknar behörighet att ändra underhållskostnader" }, { status: 403 });
      }
      if (body.component !== undefined) component = String(body.component || "").trim();
      if (body.measure !== undefined) measure = String(body.measure || "").trim();
      if (body.plannedYear !== undefined) plannedYear = Number(body.plannedYear);
      if (body.estimatedCost !== undefined) estimatedCost = Number(body.estimatedCost);
      if (body.priority !== undefined) priority = String(body.priority || "normal").trim();
      if (body.intervalYears !== undefined) intervalYears = Number(body.intervalYears);

      if (!component || !measure || !Number.isInteger(plannedYear) || plannedYear < 2020 || !Number.isFinite(estimatedCost) || estimatedCost < 0 || !Number.isInteger(intervalYears) || intervalYears < 0) {
        return NextResponse.json({ error: "Kontrollera byggnadsdel, åtgärd, år, intervall och kostnad" }, { status: 400 });
      }
      if (component.length > 180 || measure.length > 5000) {
        return NextResponse.json({ error: "Byggnadsdel eller åtgärdsbeskrivning är för lång" }, { status: 400 });
      }
    }

    let workOrderNumber: string | null = modern.work_order_number;
    let nextWorkOrderId = modern.work_order_id;
    if (workOrderId) {
      const workOrder = await db.workOrder.findFirst({
        where: { deleted_at: null, id: workOrderId, company_id: user.company_id, property_id: modern.property_id },
        select: { id: true },
      });
      if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte för aktuell fastighet" }, { status: 404 });
      const workOrderGuard = await sqlSoftDeleteGuard(db, "WorkOrder", "w");
      const rows = await db.$queryRaw<Array<{ work_order_number: string | null }>>(Prisma.sql`
        SELECT w."work_order_number" FROM "WorkOrder" w
        WHERE w."id" = ${workOrderId}
          ${workOrderGuard}
        LIMIT 1
      `);
      workOrderNumber = rows[0]?.work_order_number ?? null;
      nextWorkOrderId = workOrderId;
    }

    const updateResult = await db.portfolioMaintenanceItem.updateMany({
      where: { id: modern.id, company_id: user.company_id },
      data: {
        ...(hasStatus || workOrderId
          ? {
              status: nextStatus,
              work_order_id: nextWorkOrderId,
              work_order_number: workOrderNumber,
            }
          : {}),
        ...(hasFieldUpdate
          ? {
              component,
              measure,
              planned_year: plannedYear,
              estimated_cost: estimatedCost,
              priority,
              interval_years: intervalYears,
            }
          : {}),
      },
    });
    if (updateResult.count === 0) return NextResponse.json({ error: "Underhållsåtgärden hittades inte" }, { status: 404 });

    await writeAuditLog(user, {
      entityType: "property",
      entityId: modern.property_id,
      action: hasFieldUpdate ? "maintenance.plan.item.updated" : action,
      metadata: {
        item_id: modern.id,
        component,
        measure,
        planned_year: plannedYear,
        estimated_cost: estimatedCost,
        priority,
        interval_years: intervalYears,
        status: nextStatus,
        work_order_id: nextWorkOrderId,
        work_order_number: workOrderNumber,
        updated_at: new Date().toISOString(),
        storage: "PortfolioMaintenanceItem",
      },
    });
    return NextResponse.json({ success: true, id: modern.id, status: nextStatus });
  } catch (error) {
    logger.error("Update maintenance item error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
