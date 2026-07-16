import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser, canManageTickets } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  addWorkOrderStatusEvent,
  calculateWorkOrderSla,
  canTransitionWorkOrder,
  getWorkOrderEnterpriseState,
  getWorkOrderStatusEvents,
} from "@/lib/work-order-enterprise-core";
import { getWorkOrderAssetLink, setWorkOrderAssetLinks, validateWorkOrderAssetLinks } from "@/lib/work-order-asset-links";
import { syncCompletedWorkOrderToComponent } from "@/lib/component-work-order-sync";
import {
  normalizeWorkOrderPriority,
  normalizeWorkOrderStatus,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from "@/lib/work-order-workflow";

function parseOptionalDate(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseOptionalMoney(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

const include = {
  property: { select: { id: true, name: true, address: true, city: true } },
  unit: { select: { id: true, designation: true, unit_type: true } },
  ticket: { select: { id: true, public_reference: true, title: true } },
  assigned_to: { select: { id: true, name: true, email: true } },
  created_by: { select: { id: true, name: true, email: true } },
  projects: { select: { id: true, name: true, status: true } },
  comments: {
    orderBy: { created_at: "desc" as const },
    take: 100,
    include: { user: { select: { id: true, name: true, email: true } } },
  },
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const [workOrder, users, enterprise, statusEvents, assetLink] = await Promise.all([
    db.workOrder.findFirst({ where: { id, company_id: user.company_id }, include }),
    db.user.findMany({
      where: { company_id: user.company_id, status: "active" },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    }),
    getWorkOrderEnterpriseState(db, user.company_id, id),
    getWorkOrderStatusEvents(db, user.company_id, id),
    getWorkOrderAssetLink(db, user.company_id, id),
  ]);
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });
  return NextResponse.json(
    { workOrder: { ...workOrder, enterprise: enterprise ? { ...enterprise, ...assetLink } : assetLink, statusEvents }, users, canManage: canManageTickets(user.role) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const [existing, enterpriseBefore, assetLinkBefore] = await Promise.all([
    db.workOrder.findFirst({
      where: { id, company_id: user.company_id },
      select: {
        id: true,
        property_id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        actual_cost: true,
        scheduled_start: true,
        scheduled_end: true,
        completed_at: true,
        created_at: true,
      },
    }),
    getWorkOrderEnterpriseState(db, user.company_id, id),
    getWorkOrderAssetLink(db, user.company_id, id),
  ]);
  if (!existing) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Ogiltigt innehåll" }, { status: 400 });

  const data: {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    assigned_to_id?: string | null;
    scheduled_start?: Date | null;
    scheduled_end?: Date | null;
    estimated_cost?: number | null;
    actual_cost?: number | null;
    completed_at?: Date | null;
  } = {};

  let nextStatus: WorkOrderStatus | null = null;
  let nextPriority: WorkOrderPriority | null = null;
  const statusReason = body.statusReason === undefined ? null : String(body.statusReason || "").trim();
  const assetLinksChanged = body.buildingId !== undefined || body.technicalAssetId !== undefined;
  const buildingId = body.buildingId !== undefined ? (body.buildingId ? String(body.buildingId).trim() : null) : assetLinkBefore?.building_id ?? null;
  const technicalAssetId = body.technicalAssetId !== undefined ? (body.technicalAssetId ? String(body.technicalAssetId).trim() : null) : assetLinkBefore?.technical_asset_id ?? null;

  if (body.title !== undefined) {
    const value = String(body.title).trim();
    if (!value) return NextResponse.json({ error: "Rubrik får inte vara tom" }, { status: 400 });
    data.title = value;
  }
  if (body.description !== undefined) {
    const value = String(body.description).trim();
    if (!value) return NextResponse.json({ error: "Beskrivning får inte vara tom" }, { status: 400 });
    data.description = value;
  }
  if (body.status !== undefined) {
    const raw = String(body.status).trim();
    if (!WORK_ORDER_STATUSES.includes(raw as never)) return NextResponse.json({ error: "Ogiltig status" }, { status: 400 });
    nextStatus = normalizeWorkOrderStatus(raw);
    const currentStatus = normalizeWorkOrderStatus(existing.status);
    if (!canTransitionWorkOrder(currentStatus, nextStatus)) return NextResponse.json({ error: `Status kan inte ändras från ${currentStatus} till ${nextStatus}` }, { status: 409 });
    if (["blocked", "cancelled"].includes(nextStatus) && !statusReason) return NextResponse.json({ error: "Ange en orsak till statusändringen" }, { status: 400 });
    if (statusReason && statusReason.length > 1000) return NextResponse.json({ error: "Statusorsaken får vara högst 1 000 tecken" }, { status: 400 });
    data.status = nextStatus;
    data.completed_at = nextStatus === "completed" || nextStatus === "invoiced"
      ? existing.status === "completed" || existing.status === "invoiced" ? undefined : new Date()
      : null;
  }
  if (body.priority !== undefined) {
    const raw = String(body.priority).trim();
    if (!WORK_ORDER_PRIORITIES.includes(raw as never)) return NextResponse.json({ error: "Ogiltig prioritet" }, { status: 400 });
    nextPriority = normalizeWorkOrderPriority(raw);
    data.priority = nextPriority;
  }
  if (body.assignedToId !== undefined) {
    const assignedToId = body.assignedToId ? String(body.assignedToId).trim() : null;
    if (assignedToId) {
      const assignee = await db.user.findFirst({ where: { id: assignedToId, company_id: user.company_id, status: "active" }, select: { id: true } });
      if (!assignee) return NextResponse.json({ error: "Ansvarig användare hittades inte" }, { status: 400 });
    }
    data.assigned_to_id = assignedToId;
  }
  if (body.scheduledStart !== undefined) {
    const value = parseOptionalDate(body.scheduledStart);
    if (value === undefined) return NextResponse.json({ error: "Ogiltigt startdatum" }, { status: 400 });
    data.scheduled_start = value;
  }
  if (body.scheduledEnd !== undefined) {
    const value = parseOptionalDate(body.scheduledEnd);
    if (value === undefined) return NextResponse.json({ error: "Ogiltigt slutdatum" }, { status: 400 });
    data.scheduled_end = value;
  }
  const finalStart = data.scheduled_start !== undefined ? data.scheduled_start : existing.scheduled_start;
  const finalEnd = data.scheduled_end !== undefined ? data.scheduled_end : existing.scheduled_end;
  if (finalStart && finalEnd && finalEnd <= finalStart) return NextResponse.json({ error: "Sluttiden måste ligga efter starttiden" }, { status: 400 });
  if (body.estimatedCost !== undefined) {
    const value = parseOptionalMoney(body.estimatedCost);
    if (value === undefined) return NextResponse.json({ error: "Ogiltig beräknad kostnad" }, { status: 400 });
    data.estimated_cost = value;
  }
  if (body.actualCost !== undefined) {
    const value = parseOptionalMoney(body.actualCost);
    if (value === undefined) return NextResponse.json({ error: "Ogiltig faktisk kostnad" }, { status: 400 });
    data.actual_cost = value;
  }

  if (assetLinksChanged) {
    try {
      await validateWorkOrderAssetLinks(db, { companyId: user.company_id, propertyId: existing.property_id, buildingId, technicalAssetId });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Ogiltig komponentkoppling" }, { status: 400 });
    }
  }

  const now = new Date();
  const transactionResult = await db.$transaction(async (tx) => {
    const updated = await tx.workOrder.update({ where: { id: existing.id }, data, include });

    if (assetLinksChanged) {
      await setWorkOrderAssetLinks(tx, { workOrderId: existing.id, companyId: user.company_id!, buildingId, technicalAssetId });
    }

    if (nextPriority && nextPriority !== normalizeWorkOrderPriority(existing.priority) && !enterpriseBefore?.responded_at) {
      const sla = calculateWorkOrderSla(existing.created_at, nextPriority);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "WorkOrder"
        SET "sla_response_due_at" = ${sla.responseDueAt}, "sla_resolution_due_at" = ${sla.resolutionDueAt}
        WHERE "id" = ${existing.id} AND "company_id" = ${user.company_id!}
      `);
    }

    if (nextStatus && nextStatus !== normalizeWorkOrderStatus(existing.status)) {
      const becomesResponded = !enterpriseBefore?.responded_at && ["in_progress", "waiting_material", "blocked", "completed", "invoiced"].includes(nextStatus);
      const becomesPaused = ["waiting_material", "blocked"].includes(nextStatus);
      const becomesClosed = ["invoiced", "cancelled"].includes(nextStatus);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "WorkOrder"
        SET "responded_at" = CASE WHEN ${becomesResponded} THEN COALESCE("responded_at", ${now}) ELSE "responded_at" END,
            "paused_at" = CASE WHEN ${becomesPaused} THEN COALESCE("paused_at", ${now}) ELSE NULL END,
            "pause_reason" = CASE WHEN ${becomesPaused} THEN ${statusReason || (nextStatus === "waiting_material" ? "Väntar material" : "Blockerad")} ELSE NULL END,
            "closed_at" = CASE WHEN ${becomesClosed} THEN COALESCE("closed_at", ${now}) ELSE NULL END
        WHERE "id" = ${existing.id} AND "company_id" = ${user.company_id!}
      `);
      await addWorkOrderStatusEvent(tx, {
        companyId: user.company_id!,
        workOrderId: existing.id,
        actorUserId: user.id,
        fromStatus: existing.status,
        toStatus: nextStatus,
        reason: statusReason,
        metadata: {
          priorityBefore: existing.priority,
          priorityAfter: nextPriority ?? existing.priority,
          scheduledStart: finalStart?.toISOString() ?? null,
          scheduledEnd: finalEnd?.toISOString() ?? null,
          buildingId,
          technicalAssetId,
        },
      });
    }

    const finalStatus = normalizeWorkOrderStatus(updated.status);
    const isCompleted = finalStatus === "completed" || finalStatus === "invoiced";
    const componentSync = await syncCompletedWorkOrderToComponent(tx, {
      companyId: user.company_id!,
      propertyId: existing.property_id,
      technicalAssetId: isCompleted ? technicalAssetId : null,
      workOrderId: existing.id,
      workOrderNumber: enterpriseBefore?.work_order_number ?? null,
      workType: enterpriseBefore?.work_type || "corrective",
      title: updated.title,
      description: updated.description,
      actorUserId: user.id,
      completedAt: updated.completed_at ?? existing.completed_at ?? now,
      actualCost: updated.actual_cost === null ? null : Number(updated.actual_cost),
    });

    return { workOrder: updated, componentSync };
  });

  const workOrder = transactionResult.workOrder;
  const [enterprise, statusEvents, assetLink] = await Promise.all([
    getWorkOrderEnterpriseState(db, user.company_id, existing.id),
    getWorkOrderStatusEvents(db, user.company_id, existing.id),
    getWorkOrderAssetLink(db, user.company_id, existing.id),
  ]);
  await writeAuditLog(user, {
    entityType: "work_order",
    entityId: workOrder.id,
    action: "work_order.updated",
    metadata: {
      previousStatus: existing.status,
      status: workOrder.status,
      statusReason,
      assignedToId: workOrder.assigned_to_id,
      buildingId,
      technicalAssetId,
      estimatedCost: workOrder.estimated_cost?.toString() ?? null,
      actualCost: workOrder.actual_cost?.toString() ?? null,
      componentSync: transactionResult.componentSync,
      enterprise,
    },
  });
  return NextResponse.json({ workOrder: { ...workOrder, enterprise: enterprise ? { ...enterprise, ...assetLink } : assetLink, statusEvents } });
}
