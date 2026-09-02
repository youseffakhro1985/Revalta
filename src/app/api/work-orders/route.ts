import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
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
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/work-orders";
const ACTIVE_WORK_ORDER_STATUSES = ["completed", "invoiced", "cancelled"] as const;
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const SAFE_ASSET_LINK_MESSAGES = new Set([
  "Fastigheten hittades inte",
  "Byggnaden tillhör inte vald fastighet",
  "Komponenten tillhör inte vald fastighet",
  "Komponenten tillhör inte vald byggnad",
]);

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

function safeAssetLinkMessage(error: unknown) {
  return error instanceof Error && SAFE_ASSET_LINK_MESSAGES.has(error.message)
    ? error.message
    : "Ogiltig komponentkoppling";
}

function successResponse(
  observability: ReturnType<typeof createRouteObservability>,
  body: unknown,
  init?: ResponseInit,
) {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(SUCCESS_HEADERS)) {
    headers.set(name, value);
  }
  return observability.correlate(NextResponse.json(body, { ...init, headers }));
}

function reject(
  observability: ReturnType<typeof createRouteObservability>,
  options: {
    status: number;
    code: Parameters<typeof apiErrorResponse>[0]["code"];
    message: string;
    event: string;
    context?: Record<string, unknown>;
  },
) {
  observability.logger.warn("work-order request rejected", observability.elapsed({
    event: options.event,
    ...options.context,
  }));
  return apiErrorResponse({
    status: options.status,
    code: options.code,
    message: options.message,
    requestId: observability.requestId,
  });
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

export async function GET(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "work_orders.list.unauthorized",
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        event: "work_orders.list.missing_company",
        context: { userId: user.id },
      });
    }

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
    const view = new URL(request.url).searchParams.get("view");
    const activeOnly = view === "planning" || view === "priority";

    const workOrders = await db.workOrder.findMany({
      where: {
        company_id: user.company_id,
        ...workOrderActive,
        property: { deleted_at: null },
        ...assignedScope,
        ...(activeOnly ? { status: { notIn: [...ACTIVE_WORK_ORDER_STATUSES] } } : {}),
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
    });

    // Only enrich the rows that can actually be returned. Previously this query
    // scanned every work order in the tenant even though the list is capped.
    const workOrderIds = workOrders.map((workOrder) => workOrder.id);
    const [enterpriseRows, assignees] = await Promise.all([
      workOrderIds.length > 0
        ? db.$queryRaw<EnterpriseListRow[]>(Prisma.sql`
        SELECT w."id", w."work_order_number", w."work_type", w."source", w."sla_response_due_at", w."sla_resolution_due_at",
               w."responded_at", w."paused_at", w."pause_reason", w."closed_at", w."building_id", b."name" AS "building_name",
               w."technical_asset_id", a."name" AS "technical_asset_name", a."category" AS "technical_asset_category",
               a."location" AS "technical_asset_location"
        FROM "WorkOrder" w
        INNER JOIN "Property" p ON p."id" = w."property_id"
        LEFT JOIN "Building" b ON b."id" = w."building_id"
        LEFT JOIN "PropertyTechnicalAsset" a ON a."id" = w."technical_asset_id"
        WHERE w."company_id" = ${user.company_id}
          AND w."id" IN (${Prisma.join(workOrderIds)})
          ${workOrderGuard}
          ${propertyGuard}
          ${scopedToAssigned ? Prisma.sql`AND w."assigned_to_id" = ${user.id}` : Prisma.empty}
      `)
        : Promise.resolve([] as EnterpriseListRow[]),
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

    observability.logger.info("work-order list completed", observability.elapsed({
      event: "work_orders.list.completed",
      userId: user.id,
      companyId: user.company_id,
      returned: enriched.length,
      resultScope: activeOnly ? "active" : "default",
      scopedToAssigned,
    }));

    return successResponse(observability, {
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
      resultScope: activeOnly ? "active" : "default",
    });
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      observability.logger.error("work-order list schema unavailable", error, observability.elapsed({
        event: "work_orders.list.schema_unavailable",
      }));
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId: observability.requestId,
      });
    }

    observability.logger.error("work-order list failed", error, observability.elapsed({
      event: "work_orders.list.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "work_orders.create.unauthorized",
      });
    }
    if (!canManageTickets(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet",
        event: "work_orders.create.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        event: "work_orders.create.missing_company",
        context: { userId: user.id },
      });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ogiltigt innehåll",
        event: "work_orders.create.validation_failed",
        context: { reason: "invalid_body", userId: user.id, companyId: user.company_id },
      });
    }

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
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att tilldela arbetsorder till andra",
        event: "work_orders.create.assignment_forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }
    const assignedToId = canAssign ? requestedAssigneeId : user.id;

    const validationFailure = (message: string, reason: string) => reject(observability, {
      status: 400,
      code: API_ERROR_CODES.validationFailed,
      message,
      event: "work_orders.create.validation_failed",
      context: { reason, userId: user.id, companyId: user.company_id },
    });

    if (!propertyId || !title || !description) return validationFailure("Fastighet, rubrik och beskrivning krävs", "missing_required_fields");
    if (title.length > 180) return validationFailure("Rubriken får vara högst 180 tecken", "title_too_long");
    if (description.length > 10000) return validationFailure("Beskrivningen får vara högst 10 000 tecken", "description_too_long");
    if (!WORK_ORDER_STATUSES.includes(rawStatus as (typeof WORK_ORDER_STATUSES)[number])) return validationFailure("Ogiltig arbetsorderstatus", "invalid_status");
    if (!WORK_ORDER_PRIORITIES.includes(rawPriority as (typeof WORK_ORDER_PRIORITIES)[number])) return validationFailure("Ogiltig prioritet", "invalid_priority");
    if (!WORK_ORDER_TYPES.includes(rawWorkType as (typeof WORK_ORDER_TYPES)[number])) return validationFailure("Ogiltig arbetstyp", "invalid_work_type");
    if (!WORK_ORDER_SOURCES.includes(rawSource as (typeof WORK_ORDER_SOURCES)[number])) return validationFailure("Ogiltigt ursprung", "invalid_source");
    if (body.scheduledStart && !scheduledStart) return validationFailure("Ogiltigt startdatum", "invalid_start_date");
    if (body.scheduledEnd && !scheduledEnd) return validationFailure("Ogiltigt slutdatum", "invalid_end_date");
    if (scheduledStart && scheduledEnd && scheduledEnd <= scheduledStart) return validationFailure("Sluttiden måste ligga efter starttiden", "invalid_date_range");
    if (body.estimatedCost !== undefined && body.estimatedCost !== "" && estimatedCost === null) return validationFailure("Beräknad kostnad måste vara ett positivt belopp", "invalid_estimated_cost");
    if (body.estimatedCost !== undefined && body.estimatedCost !== null && body.estimatedCost !== "" && !canManageWorkOrderFinance(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att sätta arbetsorderkostnader",
        event: "work_orders.create.finance_forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const property = await db.property.findFirst({ where: { id: propertyId, company_id: user.company_id, deleted_at: null }, select: { id: true } });
    if (!property) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Fastigheten hittades inte",
        event: "work_orders.create.property_not_found",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    if (unitId) {
      const unit = await db.unit.findFirst({ where: { id: unitId, property_id: propertyId }, select: { id: true } });
      if (!unit) return validationFailure("Enheten tillhör inte fastigheten", "unit_property_mismatch");
    }
    if (assignedToId) {
      const assignee = await db.user.findFirst({ where: { id: assignedToId, company_id: user.company_id, status: "active" }, select: { id: true } });
      if (!assignee) return validationFailure("Ansvarig användare hittades inte", "assignee_not_found");
    }
    if (ticketId) {
      const ticket = await findAccessibleTicket(user, ticketId);
      if (!ticket) {
        return reject(observability, {
          status: 404,
          code: API_ERROR_CODES.notFound,
          message: "Ärendet hittades inte",
          event: "work_orders.create.ticket_not_found",
          context: { userId: user.id, companyId: user.company_id },
        });
      }
      if (!ticket.property_id) {
        return validationFailure("Ärendet måste kopplas till en fastighet innan det kan länkas till en arbetsorder", "ticket_missing_property");
      }
      if (ticket.property_id !== propertyId) {
        return validationFailure("Ärendet tillhör inte vald fastighet", "ticket_property_mismatch");
      }
    }
    try {
      await validateWorkOrderAssetLinks(db, { companyId: user.company_id, propertyId, buildingId, technicalAssetId });
    } catch (error) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: safeAssetLinkMessage(error),
        event: "work_orders.create.asset_link_invalid",
        context: { userId: user.id, companyId: user.company_id },
      });
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
      const enterprise = { work_order_number: workOrderNumber, work_type: workType, source, sla_response_due_at: sla.responseDueAt, sla_resolution_due_at: sla.resolutionDueAt, responded_at: null, paused_at: null, pause_reason: null, closed_at: null, building_id: buildingId, technical_asset_id: technicalAssetId };
      await writeAuditLog(user, { entityType: "work_order", entityId: created.id, action: "work_order.created", metadata: { workOrderNumber, propertyId, buildingId, technicalAssetId, unitId, assignedToId, ticketId, status, priority, workType, source, estimatedCost, scheduledStart, scheduledEnd, sla } }, tx);
      return { ...created, enterprise };
    });

    observability.logger.info("work-order create completed", observability.elapsed({
      event: "work_orders.create.completed",
      userId: user.id,
      companyId: user.company_id,
      workOrderId: workOrder.id,
    }));
    return successResponse(observability, { workOrder }, { status: 201 });
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      observability.logger.error("work-order create schema unavailable", error, observability.elapsed({
        event: "work_orders.create.schema_unavailable",
      }));
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId: observability.requestId,
      });
    }

    observability.logger.error("work-order create failed", error, observability.elapsed({
      event: "work_orders.create.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
