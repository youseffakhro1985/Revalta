import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { addWorkOrderStatusEvent, allocateWorkOrderNumber, calculateWorkOrderSla, setWorkOrderEnterpriseFields } from "@/lib/work-order-enterprise-core";
import { setWorkOrderAssetLinks } from "@/lib/work-order-asset-links";
import { normalizeWorkOrderPriority } from "@/lib/work-order-workflow";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/properties/[id]/maintenance-plan/action/work-order" });
const CLOSED_ACTION_STATUSES = new Set(["completed", "cancelled"]);

function text(value: unknown, max = 80) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet att skapa arbetsorder" }, { status: 403 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
    const companyId = user.company_id;

    const { id: propertyId } = await params;
    const property = await db.property.findFirst({
      where: { id: propertyId, deleted_at: null, ...tenantWhere(user) },
      select: { id: true, name: true },
    });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const body = await request.json().catch(() => null) as { actionId?: unknown } | null;
    const actionId = text(body?.actionId);
    if (!actionId) return NextResponse.json({ error: "Åtgärden saknas" }, { status: 400 });

    const action = await db.maintenanceAction.findFirst({
      where: { id: actionId, company_id: companyId, property_id: property.id },
    });
    if (!action) return NextResponse.json({ error: "Åtgärden hittades inte" }, { status: 404 });
    if (CLOSED_ACTION_STATUSES.has(action.status)) {
      return NextResponse.json({ error: "Arbetsorder kan inte skapas för en avslutad eller avbruten åtgärd" }, { status: 409 });
    }
    if (action.source_work_order_id) {
      return NextResponse.json({
        error: "Åtgärden har redan en arbetsorder",
        workOrderId: action.source_work_order_id,
      }, { status: 409 });
    }

    const created = await db.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
        SELECT pg_try_advisory_xact_lock(hashtext(${`maintenance-action-work-order:${action.id}`})) AS locked
      `);
      if (!lock[0]?.locked) return { conflict: "locked" as const, workOrderId: null, workOrderNumber: null };

      const fresh = await tx.maintenanceAction.findFirst({
        where: { id: action.id, company_id: companyId, property_id: property.id },
        select: { source_work_order_id: true, status: true },
      });
      if (!fresh) return { conflict: "missing" as const, workOrderId: null, workOrderNumber: null };
      if (fresh.source_work_order_id) {
        return { conflict: "already_linked" as const, workOrderId: fresh.source_work_order_id, workOrderNumber: null };
      }

      const createdAt = new Date();
      const priority = normalizeWorkOrderPriority(action.priority);
      const sla = calculateWorkOrderSla(createdAt, priority);
      const workOrderNumber = await allocateWorkOrderNumber(tx, companyId, createdAt);
      const scheduledStart = new Date(action.planned_year, 0, 15, 8, 0);
      const workOrder = await tx.workOrder.create({
        data: {
          company_id: companyId,
          property_id: property.id,
          created_by_id: user.id,
          title: `${action.title} · ${property.name}`,
          description: [
            `Förebyggande underhåll från underhållsplanen (${action.category}).`,
            action.scope ? `Omfattning: ${action.scope}` : "",
            action.description ? `Beskrivning: ${action.description}` : "",
            action.contractor ? `Entreprenör: ${action.contractor}` : "",
            `Planerat år: ${action.planned_year}`,
          ].filter(Boolean).join("\n\n"),
          status: "planned",
          priority,
          scheduled_start: Number.isNaN(scheduledStart.getTime()) ? null : scheduledStart,
          estimated_cost: action.estimated_cost,
          created_at: createdAt,
        },
      });
      await setWorkOrderEnterpriseFields(tx, {
        workOrderId: workOrder.id,
        companyId,
        workOrderNumber,
        workType: "preventive",
        source: "maintenance_plan",
        responseDueAt: sla.responseDueAt,
        resolutionDueAt: sla.resolutionDueAt,
      });
      await setWorkOrderAssetLinks(tx, {
        workOrderId: workOrder.id,
        companyId,
        buildingId: action.building_id,
        technicalAssetId: action.technical_asset_id,
      });
      await addWorkOrderStatusEvent(tx, {
        companyId,
        workOrderId: workOrder.id,
        actorUserId: user.id,
        fromStatus: null,
        toStatus: "planned",
        reason: "Skapad från underhållsåtgärd",
        metadata: { maintenanceActionId: action.id, planId: action.maintenance_plan_id },
      });

      const nextStatus = fresh.status === "planned" || fresh.status === "approved" ? "in_progress" : fresh.status;
      const linked = await tx.maintenanceAction.updateMany({
        where: { id: action.id, company_id: companyId, property_id: property.id, source_work_order_id: null },
        data: {
          source_work_order_id: workOrder.id,
          status: nextStatus,
          updated_at: new Date(),
        },
      });
      if (linked.count === 0) {
        throw new Error("Kunde inte länka arbetsordern till underhållsåtgärden");
      }

      await writeAuditLog(user, {
        entityType: "maintenance_action",
        entityId: action.id,
        action: "maintenance_action.work_order_created",
        metadata: {
          propertyId: property.id,
          planId: action.maintenance_plan_id,
          workOrderId: workOrder.id,
          workOrderNumber,
          plannedYear: action.planned_year,
          priority: action.priority,
        },
      }, tx);

      return { conflict: null, workOrderId: workOrder.id, workOrderNumber };
    });

    if (created.conflict === "locked") {
      return NextResponse.json({ error: "Arbetsorder skapas redan för den här åtgärden, försök igen om en stund" }, { status: 409 });
    }
    if (created.conflict === "missing") {
      return NextResponse.json({ error: "Åtgärden hittades inte" }, { status: 404 });
    }
    if (created.conflict === "already_linked") {
      return NextResponse.json({ error: "Åtgärden har redan en arbetsorder", workOrderId: created.workOrderId }, { status: 409 });
    }

    return NextResponse.json({ success: true, workOrderId: created.workOrderId, workOrderNumber: created.workOrderNumber }, { status: 201 });
  } catch (error) {
    logger.error("Create maintenance action work order error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
