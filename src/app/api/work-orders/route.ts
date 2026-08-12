import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import {
  canAssignWorkOrders,
  canManageTickets,
  canManageWorkOrderFinance,
  canViewFinanceData,
  getCurrentUser,
  shouldScopeToAssignedWork,
} from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  addWorkOrderStatusEvent,
  allocateWorkOrderNumber,
  calculateWorkOrderSla,
  normalizeWorkOrderSource,
  normalizeWorkOrderType,
  setWorkOrderEnterpriseFields,
  WORK_ORDER_SOURCES,
  WORK_ORDER_TYPES,
} from "@/lib/work-order-enterprise-core";
import { setWorkOrderAssetLinks, validateWorkOrderAssetLinks } from "@/lib/work-order-asset-links";
import { evaluateWorkOrderSla } from "@/lib/work-order-sla";
import { WORK_ORDER_PRIORITIES, WORK_ORDER_STATUSES, normalizeWorkOrderPriority, normalizeWorkOrderStatus } from "@/lib/work-order-workflow";
import {
  isMissingSchemaColumnError,
  notDeletedFilter,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";
import { sqlSoftDeleteGuard } from "@/lib/soft-delete-compat";
import { findAccessibleTicket } from "@/lib/assigned-work-access";

function parseOptionalDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseOptionalMoney(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

type EnterpriseListRow = {
  id: string;
  work_order_number: string | null;
  work_type: string;
  source: string;
  sla_response_due_at: Date | null;
  sla_resolution_due_at: Date | null;
  responded_at: Date | null;
  paused_at: Date | null;
  pause_reason: string | null;
  closed_at: Date | null;
  building_id: string | null;
  building_name: string | null;
  technical_asset_id: string | null;
  technical_asset_name: string | null;
  technical_asset_category: string | null;
  technical_asset_location: string | null;
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const [workOrderActive, projectActive, workOrderGuard, propertyGuard] = await Promise.all([
      notDeletedFilter("WorkOrder"),
      notDeletedFilter("Project"),
      sqlSoftDeleteGuard(db, "WorkOrder", "w"),
      sqlSoftDeleteGuard(db, "Property", "p"),
    ]);

    const scopedToAssigned = shouldScopeToAssignedWork(user.role);
    const canAssign = canAssignWorkOrders(user.role);
    const canManage = canManageTickets(user.role);
    const includeFinance = canViewFinanceData(user.role);
    const canManageFinance = canManageWorkOrderFinance(user.role);
    const assignedScope = scopedToAssigned ? { assigned_to_id: user.id } : {};

    const [workOrders, enterpriseRows, assignees] = await Promise.all([
      db.workOrder.findMany({
        where: {
          company_id: user.company_id,
          ...workOrderActive,
          property: { deleted_at: null },
          ...assignedScope,
        },
        orderBy: [{ status: "asc" }, { scheduled_start: "asc" }, { created_at: "desc" }],
        take: 500,
        // Explicit select omits deleted_at so preview works before soft-delete migrate.
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          estimated_cost: true,
          completed_at: true,
          scheduled_start: true,
          created_at: true,
          property: { select: { id: true, name: true, address: true, city: true } },
          unit: { select: { id: true, designation: true, unit_type: true } },
          ticket: { select: { id: true, public_reference: true, title: true } },
          assigned_to: { select: { id: true, name: true, email: true } },
          projects: {
            ...(Object.keys(projectActive).length > 0 ? { where: projectActive } : {}),
            select: { id: true, name: true, status: true },
          },
        },
      }),
      db.$queryRaw<EnterpriseListRow[]>(Prisma.sql`
        SELECT w."id", w."work_order_number", w."work_type", w."source", w."sla_response_due_at", w."sla_resolution_due_at",
               w."responded_at", w."paused_at", w."pause_reason", w."closed_at", w."building_id", b."name" AS "building_name",
               w."technical_asset_id", a."name" AS "technical_asset_name", a."category" AS "technical_asset_category",
               a."location" AS "technical_asset_location"
        FROM "WorkOrder" w
        INNER JOIN "Property" p ON p."id" = w."property_id"
        LEFT JOIN "Building" b ON b."id" = w."building_id"
        LEFT JOIN "PropertyTechnicalAsset" a ON a."id" = w."technical_asset_id"
        WHERE w."company_id" = ${user.company_id}
          ${workOrderGuard}
          ${propertyGuard}
          ${scopedToAssigned ? Prisma.sql`AND w."assigned_to_id" = ${user.id}` : Prisma.empty}
      `),
      canAssign
        ? db.user.findMany({
            where: {
              company_id: user.company_id,
              status: "active",
              role: { in: ["owner", "admin", "manager", "technician"] },
            },
            orderBy: [{ name: "asc" }, { email: "asc" }],
            select: { id: true, name: true, email: true },
          })
        : Promise.resolve([]),
    ]);

    const now = new Date();
    const enterpriseById = new Map(enterpriseRows.map((row) => [row.id, row]));
    const enriched = workOrders.map((workOrder) => {
      const enterprise = enterpriseById.get(workOrder.id) ?? null;
      const sla = evaluateWorkOrderSla({
        status: workOrder.status,
        responseDueAt: enterprise?.sla_response_due_at,
        resolutionDueAt: enterprise?.sla_resolution_due_at,
        respondedAt: enterprise?.responded_at,
        completedAt: workOrder.completed_at,
        closedAt: enterprise?.closed_at,
        pausedAt: enterprise?.paused_at,
        pauseReason: enterprise?.pause_reason,
      }, now);
      return {
        ...workOrder,
        estimated_cost: includeFinance ? workOrder.estimated_cost : null,
        enterprise,
        sla,
      };
    });

    const slaSummary = enriched.reduce((summary, workOrder) => {
      summary.total += 1;
      summary[workOrder.sla.risk] += 1;
      if (workOrder.sla.phase === "response") summary.awaitingResponse += 1;
      if (workOrder.sla.phase === "resolution") summary.awaitingResolution += 1;
      return summary;
    }, {
      total: 0,
      overdue: 0,
      critical: 0,
      soon: 0,
      normal: 0,
      fulfilled: 0,
      paused: 0,
      not_configured: 0,
      awaitingResponse: 0,
      awaitingResolution: 0,
    });

    return NextResponse.json(
      {
        workOrders: enriched,
        slaSummary,
        evaluatedAt: now.toISOString(),
        assignees,
        permissions: {
          canManage,
          canAssign,
          canManageFinance,
          canViewFinance: includeFinance,
          scopedToAssigned,
        },
        currentUserId: user.id,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Get work orders error:", error);
    if (isMissingSchemaColumnError(error)) {
      return NextResponse.json({ error: schemaMismatchUserMessage() }, { status: 503 });
    }
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Ogiltigt innehåll" }, { status: 400 });

  const propertyId = String(body.propertyId || "").trim();
  const buildingId = body.buildingId ? String(body.buildingId).trim() : null;
  const technicalAssetId = body.technicalAssetId ? String(body.technicalAssetId).trim() : null;
  const unitId = body.unitId ? String(body.unitId).trim() : null;
  const requestedAssigneeId = body.assignedToId ? String(body.assignedToId).trim() : null;
  const ticketId = body.ticketId ? String(body.ticketId).trim() : null;
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const rawStatus = String(body.status || "planned").trim();
  const rawPriority = String(body.priority || "normal").trim();
  const rawWorkType = String(body.workType || "corrective").trim();
  const rawSource = String(body.source || (technicalAssetId ? "component" : ticketId ? "ticket" : "internal")).trim();
  const status = normalizeWorkOrderStatus(rawStatus);
  const priority = normalizeWorkOrderPriority(rawPriority);
  const workType = normalizeWorkOrderType(rawWorkType);
  const source = normalizeWorkOrderSource(rawSource);
  const scheduledStart = parseOptionalDate(body.scheduledStart);
  const scheduledEnd = parseOptionalDate(body.scheduledEnd);
  const estimatedCost = parseOptionalMoney(body.estimatedCost);
  const canAssign = canAssignWorkOrders(user.role);
  if (!canAssign && requestedAssigneeId && requestedAssigneeId !== user.id) {
    return NextResponse.json({ error: "Du saknar behörighet att tilldela arbetsorder till andra" }, { status: 403 });
  }
  const assignedToId = canAssign ? requestedAssigneeId : user.id;

  if (!propertyId || !title || !description) return NextResponse.json({ error: "Fastighet, rubrik och beskrivning krävs" }, { status: 400 });
  if (title.length > 180) return NextResponse.json({ error: "Rubriken får vara högst 180 tecken" }, { status: 400 });
  if (description.length > 10000) return NextResponse.json({ error: "Beskrivningen får vara högst 10 000 tecken" }, { status: 400 });
  if (!WORK_ORDER_STATUSES.includes(rawStatus as (typeof WORK_ORDER_STATUSES)[number])) return NextResponse.json({ error: "Ogiltig arbetsorderstatus" }, { status: 400 });
  if (!WORK_ORDER_PRIORITIES.includes(rawPriority as (typeof WORK_ORDER_PRIORITIES)[number])) return NextResponse.json({ error: "Ogiltig prioritet" }, { status: 400 });
  if (!WORK_ORDER_TYPES.includes(rawWorkType as (typeof WORK_ORDER_TYPES)[number])) return NextResponse.json({ error: "Ogiltig arbetstyp" }, { status: 400 });
  if (!WORK_ORDER_SOURCES.includes(rawSource as (typeof WORK_ORDER_SOURCES)[number])) return NextResponse.json({ error: "Ogiltigt ursprung" }, { status: 400 });
  if (body.scheduledStart && !scheduledStart) return NextResponse.json({ error: "Ogiltigt startdatum" }, { status: 400 });
  if (body.scheduledEnd && !scheduledEnd) return NextResponse.json({ error: "Ogiltigt slutdatum" }, { status: 400 });
  if (scheduledStart && scheduledEnd && scheduledEnd <= scheduledStart) return NextResponse.json({ error: "Sluttiden måste ligga efter starttiden" }, { status: 400 });
  if (body.estimatedCost !== undefined && body.estimatedCost !== "" && estimatedCost === null) return NextResponse.json({ error: "Beräknad kostnad måste vara ett positivt belopp" }, { status: 400 });
  if (body.estimatedCost !== undefined && body.estimatedCost !== null && body.estimatedCost !== "" && !canManageWorkOrderFinance(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att sätta arbetsorderkostnader" }, { status: 403 });
  }

  const property = await db.property.findFirst({ where: { id: propertyId, company_id: user.company_id, deleted_at: null }, select: { id: true } });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  if (unitId) {
    const unit = await db.unit.findFirst({ where: { id: unitId, property_id: propertyId }, select: { id: true } });
    if (!unit) return NextResponse.json({ error: "Enheten tillhör inte fastigheten" }, { status: 400 });
  }
  if (assignedToId) {
    const assignee = await db.user.findFirst({ where: { id: assignedToId, company_id: user.company_id, status: "active" }, select: { id: true } });
    if (!assignee) return NextResponse.json({ error: "Ansvarig användare hittades inte" }, { status: 400 });
  }
  if (ticketId) {
    const ticket = await findAccessibleTicket(user, ticketId);
    if (!ticket) return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
  }
  try {
    await validateWorkOrderAssetLinks(db, { companyId: user.company_id, propertyId, buildingId, technicalAssetId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ogiltig komponentkoppling" }, { status: 400 });
  }

  const createdAt = new Date();
  const sla = calculateWorkOrderSla(createdAt, priority);
  const workOrder = await db.$transaction(async (tx) => {
    const workOrderNumber = await allocateWorkOrderNumber(tx, user.company_id!, createdAt);
    const created = await tx.workOrder.create({
      data: { company_id: user.company_id!, property_id: propertyId, unit_id: unitId, assigned_to_id: assignedToId, ticket_id: ticketId, created_by_id: user.id, title, description, status, priority, scheduled_start: scheduledStart, scheduled_end: scheduledEnd, estimated_cost: estimatedCost, created_at: createdAt },
    });
    await setWorkOrderEnterpriseFields(tx, { workOrderId: created.id, companyId: user.company_id!, workOrderNumber, workType, source, responseDueAt: sla.responseDueAt, resolutionDueAt: sla.resolutionDueAt });
    await setWorkOrderAssetLinks(tx, { workOrderId: created.id, companyId: user.company_id!, buildingId, technicalAssetId });
    await addWorkOrderStatusEvent(tx, { companyId: user.company_id!, workOrderId: created.id, actorUserId: user.id, fromStatus: null, toStatus: status, reason: "Arbetsorder skapad", metadata: { workOrderNumber, priority, workType, source, buildingId, technicalAssetId } });
    return { ...created, enterprise: { work_order_number: workOrderNumber, work_type: workType, source, sla_response_due_at: sla.responseDueAt, sla_resolution_due_at: sla.resolutionDueAt, responded_at: null, paused_at: null, pause_reason: null, closed_at: null, building_id: buildingId, technical_asset_id: technicalAssetId } };
  });

  await writeAuditLog(user, { entityType: "work_order", entityId: workOrder.id, action: "work_order.created", metadata: { workOrderNumber: workOrder.enterprise.work_order_number, propertyId, buildingId, technicalAssetId, unitId, assignedToId, ticketId, status, priority, workType, source, estimatedCost, scheduledStart, scheduledEnd, sla } });
  return NextResponse.json({ workOrder }, { status: 201 });
}
