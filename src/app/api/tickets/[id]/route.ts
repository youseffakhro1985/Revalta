import db from "@/lib/db";
import {
  canAssignWorkOrders,
  canManageTickets,
  getCurrentUser,
  requireCompanyUser,
} from "@/lib/current-user";
import { queueTicketNotification } from "@/lib/integrations";
import { calculateDueDate } from "@/lib/sla";
import {
  isAssignedWorkAccessible,
  redactTicketReporterPii,
} from "@/lib/assigned-work-access";
import {
  allowedWorkOrderTransitions,
  canTransitionWorkOrder,
  deriveWorkOrderStatus,
  isTerminalWorkOrderStatus,
  isWorkOrderStatus,
  type WorkOrderStatus,
} from "@/lib/work-order-lifecycle";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";
import { createLogger } from "@/lib/structured-logger";
import {
  isMissingSchemaColumnError,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";
import { NextResponse } from "next/server";

const allowedPriorities = new Set(["low", "normal", "high", "urgent"]);
const assignmentRequiredStatuses = new Set(["assigned", "in_progress", "inspection"]);
const ticketRoute = "/api/tickets/[id]";

function successHeaders(requestId: string) {
  return {
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    [REQUEST_ID_HEADER]: requestId,
  };
}

function routeLogger(method: string, requestId: string) {
  return createLogger({
    route: ticketRoute,
    method,
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}

function ticketError(status: number, code: (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES], message: string, requestId: string) {
  return apiErrorResponse({ status, code, message, requestId });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = routeLogger("GET", requestId);

  try {
    const rawUser = await getCurrentUser();
    if (!rawUser) {
      logger.warn("ticket detail unauthorized", {
        eventCode: "tickets.detail.unauthorized",
        latencyMs: Date.now() - startedAt,
      });
      return ticketError(401, API_ERROR_CODES.unauthorized, "Obehörig", requestId);
    }

    const user = requireCompanyUser(rawUser);
    if (!user) {
      logger.warn("ticket detail forbidden", {
        eventCode: "tickets.detail.forbidden",
        role: rawUser.role,
        latencyMs: Date.now() - startedAt,
      });
      return ticketError(403, API_ERROR_CODES.forbidden, "Du saknar behörighet att visa ärendet", requestId);
    }

    const { id } = await params;
    const ticket = await db.ticket.findFirst({
      where: {
        id,
        company_id: user.company_id,
        deleted_at: null,
        OR: [
          { property_id: null },
          { property: { company_id: user.company_id, deleted_at: null } },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        category: true,
        priority: true,
        public_reference: true,
        source: true,
        reporter_name: true,
        reporter_email: true,
        reporter_phone: true,
        reporter_unit: true,
        property_id: true,
        assigned_to_id: true,
        created_at: true,
        updated_at: true,
        due_date: true,
        ai_summary: true,
        ai_recommended_action: true,
        ai_confidence: true,
        ai_processed_at: true,
        property: {
          select: { id: true, name: true, address: true, city: true },
        },
        assigned_to: {
          select: { id: true, name: true, email: true },
        },
        comments: {
          orderBy: { created_at: "asc" },
          select: {
            id: true,
            body: true,
            is_internal: true,
            created_at: true,
            author_type: true,
            author_name: true,
            author_email: true,
            user: { select: { name: true, email: true } },
          },
        },
        attachments: {
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            file_name: true,
            content_type: true,
            size_bytes: true,
            data_url: true,
            created_at: true,
          },
        },
      },
    });

    if (!ticket || !isAssignedWorkAccessible(user, ticket.assigned_to_id)) {
      logger.info("ticket detail not found", {
        eventCode: "tickets.detail.not_found",
        companyId: user.company_id,
        ticketId: id,
        latencyMs: Date.now() - startedAt,
      });
      return ticketError(404, API_ERROR_CODES.notFound, "Ärendet hittades inte", requestId);
    }

    const normalizedStatus = isWorkOrderStatus(ticket.status) ? ticket.status : "new";
    const redacted = redactTicketReporterPii(user, ticket);

    logger.info("ticket detail succeeded", {
      eventCode: "tickets.detail.succeeded",
      companyId: user.company_id,
      ticketId: ticket.id,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        ticket: {
          ...redacted,
          status: normalizedStatus,
          allowedTransitions: allowedWorkOrderTransitions(normalizedStatus),
          attachments: ticket.attachments.map((attachment) => ({
            ...attachment,
            data_url: `/api/attachments/${attachment.id}`,
          })),
        },
        permissions: {
          canManage: canManageTickets(user.role),
          canAssign: canAssignWorkOrders(user.role),
        },
        requestId,
      },
      { headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.warn("ticket detail schema unavailable", {
        eventCode: "tickets.detail.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return ticketError(503, API_ERROR_CODES.serviceUnavailable, schemaMismatchUserMessage(), requestId);
    }
    logger.error("ticket detail failed", error, {
      eventCode: "tickets.detail.failed",
      latencyMs: Date.now() - startedAt,
    });
    return ticketError(500, API_ERROR_CODES.internalError, "Internt serverfel", requestId);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = routeLogger("PATCH", requestId);

  try {
    const rawUser = await getCurrentUser();
    if (!rawUser) {
      logger.warn("ticket update unauthorized", {
        eventCode: "tickets.update.unauthorized",
        latencyMs: Date.now() - startedAt,
      });
      return ticketError(401, API_ERROR_CODES.unauthorized, "Obehörig", requestId);
    }

    const user = requireCompanyUser(rawUser);
    if (!user || !canManageTickets(user.role)) {
      logger.warn("ticket update forbidden", {
        eventCode: "tickets.update.forbidden",
        role: rawUser.role,
        latencyMs: Date.now() - startedAt,
      });
      return ticketError(403, API_ERROR_CODES.forbidden, "Du saknar behörighet att uppdatera ärenden", requestId);
    }

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      status?: unknown;
      priority?: unknown;
      assignedToId?: unknown;
      transitionReason?: unknown;
    } | null;

    if (!body) {
      logger.info("ticket update validation failed", {
        eventCode: "tickets.update.validation_failed",
        field: "body",
        companyId: user.company_id,
        ticketId: id,
        latencyMs: Date.now() - startedAt,
      });
      return ticketError(400, API_ERROR_CODES.validationFailed, "Ogiltig förfrågan", requestId);
    }

    const existing = await db.ticket.findFirst({
      where: {
        id,
        company_id: user.company_id,
        deleted_at: null,
        OR: [
          { property_id: null },
          { property: { company_id: user.company_id, deleted_at: null } },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        assigned_to_id: true,
        due_date: true,
      },
    });

    if (!existing || !isAssignedWorkAccessible(user, existing.assigned_to_id)) {
      return ticketError(404, API_ERROR_CODES.notFound, "Ärendet hittades inte", requestId);
    }

    const currentStatus: WorkOrderStatus = isWorkOrderStatus(existing.status) ? existing.status : "new";
    const shouldUpdateAssignee = typeof body.assignedToId === "string" || body.assignedToId === null;

    if (shouldUpdateAssignee && !canAssignWorkOrders(user.role)) {
      return ticketError(403, API_ERROR_CODES.forbidden, "Du saknar behörighet att ändra ansvarig", requestId);
    }

    const normalizedAssignedToId =
      typeof body.assignedToId === "string" && body.assignedToId.trim()
        ? body.assignedToId.trim()
        : null;

    if (normalizedAssignedToId) {
      const assignee = await db.user.findFirst({
        where: {
          id: normalizedAssignedToId,
          company_id: user.company_id,
          status: "active",
        },
        select: { id: true },
      });
      if (!assignee) {
        return ticketError(400, API_ERROR_CODES.validationFailed, "Vald ansvarig hittades inte", requestId);
      }
    }

    const requestedStatus = body.status === undefined ? undefined : body.status;
    if (requestedStatus !== undefined && !isWorkOrderStatus(requestedStatus)) {
      return ticketError(400, API_ERROR_CODES.validationFailed, "Ogiltig arbetsorderstatus", requestId);
    }

    const normalizedPriority =
      typeof body.priority === "string" && body.priority.trim()
        ? body.priority.trim()
        : undefined;
    if (normalizedPriority && !allowedPriorities.has(normalizedPriority)) {
      return ticketError(400, API_ERROR_CODES.validationFailed, "Ogiltig prioritet", requestId);
    }

    const nextAssigneeId = shouldUpdateAssignee ? normalizedAssignedToId : existing.assigned_to_id;
    const nextStatus = deriveWorkOrderStatus({
      current: currentStatus,
      requested: requestedStatus as WorkOrderStatus | undefined,
      assignedToId: nextAssigneeId,
    });

    if (!canTransitionWorkOrder(currentStatus, nextStatus)) {
      logger.info("ticket transition conflict", {
        eventCode: "tickets.update.transition_conflict",
        companyId: user.company_id,
        ticketId: id,
        currentStatus,
        requestedStatus: nextStatus,
        latencyMs: Date.now() - startedAt,
      });
      return ticketError(409, API_ERROR_CODES.conflict, "Statusövergången är inte tillåten", requestId);
    }

    if (assignmentRequiredStatuses.has(nextStatus) && !nextAssigneeId) {
      return ticketError(400, API_ERROR_CODES.validationFailed, "En ansvarig måste väljas för denna status", requestId);
    }

    const nextPriority = normalizedPriority ?? existing.priority;
    const priorityChanged = Boolean(normalizedPriority && normalizedPriority !== existing.priority);
    const terminal = isTerminalWorkOrderStatus(nextStatus);
    const transitionReason =
      typeof body.transitionReason === "string"
        ? body.transitionReason.trim().slice(0, 500)
        : "";

    const ticket = await db.$transaction(async (tx) => {
      const updateResult = await tx.ticket.updateMany({
        where: {
          id,
          company_id: user.company_id,
          deleted_at: null,
          status: existing.status,
          assigned_to_id: existing.assigned_to_id,
        },
        data: {
          status: nextStatus,
          priority: normalizedPriority,
          assigned_to_id: shouldUpdateAssignee ? normalizedAssignedToId : undefined,
          due_date: priorityChanged && !terminal ? calculateDueDate(nextPriority) : undefined,
          closed_at:
            nextStatus === "closed"
              ? new Date()
              : currentStatus === "closed"
                ? null
                : undefined,
        },
      });
      if (updateResult.count === 0) return null;

      const updated = await tx.ticket.findFirst({
        where: { id, company_id: user.company_id, deleted_at: null },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          due_date: true,
          closed_at: true,
          assigned_to: { select: { id: true, name: true, email: true } },
        },
      });
      if (!updated) return null;

      await tx.auditLog.create({
        data: {
          actor_user_id: user.id,
          company_id: user.company_id,
          entity_type: "ticket",
          entity_id: updated.id,
          action: currentStatus === nextStatus ? "ticket.updated" : "ticket.status_changed",
          metadata: {
            previousStatus: currentStatus,
            nextStatus,
            previousPriority: existing.priority,
            nextPriority: updated.priority,
            previousAssignedToId: existing.assigned_to_id,
            nextAssignedToId: updated.assigned_to?.id ?? null,
            previousDueDate: existing.due_date,
            nextDueDate: updated.due_date,
            reason: transitionReason || null,
          },
        },
      });

      return updated;
    });

    if (!ticket) {
      logger.warn("ticket update concurrent conflict", {
        eventCode: "tickets.update.concurrent_conflict",
        companyId: user.company_id,
        ticketId: id,
        latencyMs: Date.now() - startedAt,
      });
      return ticketError(409, API_ERROR_CODES.conflict, "Ärendet ändrades av en annan användare. Ladda om och försök igen.", requestId);
    }

    const notificationResult = await Promise.allSettled([
      queueTicketNotification(user, {
        ticketId: ticket.id,
        title: ticket.title,
        recipient: user.email,
        event: "updated",
      }),
    ]);
    if (notificationResult[0]?.status === "rejected") {
      logger.warn("ticket update partial failure", {
        eventCode: "tickets.update.partial_failure",
        companyId: user.company_id,
        ticketId: ticket.id,
        failedEffects: 1,
        latencyMs: Date.now() - startedAt,
      });
    }

    logger.info("ticket update succeeded", {
      eventCode: "tickets.update.succeeded",
      companyId: user.company_id,
      ticketId: ticket.id,
      status: ticket.status,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        success: true,
        ticket,
        allowedTransitions: allowedWorkOrderTransitions(ticket.status as WorkOrderStatus),
        requestId,
      },
      { headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.warn("ticket update schema unavailable", {
        eventCode: "tickets.update.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return ticketError(503, API_ERROR_CODES.serviceUnavailable, schemaMismatchUserMessage(), requestId);
    }
    logger.error("ticket update failed", error, {
      eventCode: "tickets.update.failed",
      latencyMs: Date.now() - startedAt,
    });
    return ticketError(500, API_ERROR_CODES.internalError, "Internt serverfel", requestId);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = routeLogger("DELETE", requestId);

  try {
    const rawUser = await getCurrentUser();
    if (!rawUser) {
      logger.warn("ticket delete unauthorized", {
        eventCode: "tickets.delete.unauthorized",
        latencyMs: Date.now() - startedAt,
      });
      return ticketError(401, API_ERROR_CODES.unauthorized, "Obehörig", requestId);
    }

    const user = requireCompanyUser(rawUser);
    if (!user || !canManageTickets(user.role)) {
      logger.warn("ticket delete forbidden", {
        eventCode: "tickets.delete.forbidden",
        role: rawUser.role,
        latencyMs: Date.now() - startedAt,
      });
      return ticketError(403, API_ERROR_CODES.forbidden, "Du saknar behörighet att ta bort ärenden", requestId);
    }

    const { id } = await params;
    const existing = await db.ticket.findFirst({
      where: {
        id,
        company_id: user.company_id,
        deleted_at: null,
        OR: [
          { property_id: null },
          { property: { company_id: user.company_id, deleted_at: null } },
        ],
      },
      select: { id: true, status: true, assigned_to_id: true },
    });

    if (!existing || !isAssignedWorkAccessible(user, existing.assigned_to_id)) {
      return ticketError(404, API_ERROR_CODES.notFound, "Ärendet hittades inte", requestId);
    }

    const deleted = await db.$transaction(async (tx) => {
      const deleteResult = await tx.ticket.updateMany({
        where: {
          id: existing.id,
          company_id: user.company_id,
          deleted_at: null,
          status: existing.status,
          assigned_to_id: existing.assigned_to_id,
        },
        data: { deleted_at: new Date() },
      });
      if (deleteResult.count === 0) return false;

      await tx.auditLog.create({
        data: {
          actor_user_id: user.id,
          company_id: user.company_id,
          entity_type: "ticket",
          entity_id: existing.id,
          action: "ticket.deleted",
          metadata: {
            previousStatus: existing.status,
            previousAssignedToId: existing.assigned_to_id,
            softDelete: true,
          },
        },
      });
      return true;
    });

    if (!deleted) {
      return ticketError(409, API_ERROR_CODES.conflict, "Ärendet ändrades av en annan användare. Ladda om och försök igen.", requestId);
    }

    logger.info("ticket delete succeeded", {
      eventCode: "tickets.delete.succeeded",
      companyId: user.company_id,
      ticketId: existing.id,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      { success: true, requestId },
      { headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.warn("ticket delete schema unavailable", {
        eventCode: "tickets.delete.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return ticketError(503, API_ERROR_CODES.serviceUnavailable, schemaMismatchUserMessage(), requestId);
    }
    logger.error("ticket delete failed", error, {
      eventCode: "tickets.delete.failed",
      latencyMs: Date.now() - startedAt,
    });
    return ticketError(500, API_ERROR_CODES.internalError, "Internt serverfel", requestId);
  }
}
