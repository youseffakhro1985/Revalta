import db from "@/lib/db";
import {
  canExportTickets,
  canManageTickets,
  getCurrentUser,
  requireCompanyMember,
  requireCompanyUser,
  shouldScopeToAssignedWork,
} from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { queueTicketNotification, recordAiEvent } from "@/lib/integrations";
import { calculateDueDate } from "@/lib/sla";
import {
  isMissingSchemaColumnError,
  notDeletedFilter,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";
import { createLogger } from "@/lib/structured-logger";
import { NextResponse } from "next/server";

function successHeaders(requestId: string) {
  return {
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    [REQUEST_ID_HEADER]: requestId,
  };
}

function loggerFor(request: Request, method: "GET" | "POST") {
  const requestId = resolveRequestId(request.headers);
  return {
    requestId,
    logger: createLogger({
      route: "/api/tickets",
      method,
      requestId,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    }),
  };
}

const ticketSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  category: true,
  priority: true,
  property_id: true,
  assigned_to_id: true,
  created_at: true,
  updated_at: true,
  due_date: true,
  property: { select: { id: true, name: true, address: true, city: true } },
  assigned_to: { select: { id: true, name: true, email: true } },
  _count: { select: { comments: true } },
} as const;

export async function GET(request: Request) {
  const startedAt = Date.now();
  const { requestId, logger } = loggerFor(request, "GET");

  try {
    const member = requireCompanyMember(await getCurrentUser());
    if (!member) {
      logger.warn("ticket list unauthorized", {
        eventCode: "tickets.list.unauthorized",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        requestId,
      });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const status = searchParams.get("status")?.trim();
    const priority = searchParams.get("priority")?.trim();
    const propertyId = searchParams.get("propertyId")?.trim();
    const assignedToId = searchParams.get("assignedToId")?.trim();
    const ticketActive = await notDeletedFilter("Ticket");
    const scopedAssignedToId = shouldScopeToAssignedWork(member.role) ? member.id : assignedToId;

    const tickets = await db.ticket.findMany({
      where: {
        ...ticketActive,
        company_id: member.company_id,
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(propertyId ? { property_id: propertyId } : {}),
        ...(scopedAssignedToId ? { assigned_to_id: scopedAssignedToId } : {}),
        AND: [
          { OR: [{ property_id: null }, { property: { company_id: member.company_id, deleted_at: null } }] },
          ...(q
            ? [{
                OR: [
                  { title: { contains: q, mode: "insensitive" as const } },
                  { description: { contains: q, mode: "insensitive" as const } },
                ],
              }]
            : []),
        ],
      },
      orderBy: { created_at: "desc" },
      select: ticketSelect,
    });

    logger.info("ticket list succeeded", {
      eventCode: "tickets.list.succeeded",
      companyId: member.company_id,
      resultCount: tickets.length,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        tickets,
        permissions: {
          canManage: canManageTickets(member.role),
          canExport: canExportTickets(member.role),
        },
        requestId,
      },
      { headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.warn("ticket list schema unavailable", {
        eventCode: "tickets.list.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }

    logger.error("ticket list failed", error, {
      eventCode: "tickets.list.failed",
      latencyMs: Date.now() - startedAt,
    });
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId,
    });
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const { requestId, logger } = loggerFor(request, "POST");

  try {
    const user = requireCompanyUser(await getCurrentUser());
    if (!user) {
      logger.warn("ticket create unauthorized", {
        eventCode: "tickets.create.unauthorized",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        requestId,
      });
    }
    if (!canManageTickets(user.role)) {
      logger.warn("ticket create forbidden", {
        eventCode: "tickets.create.forbidden",
        companyId: user.company_id,
        role: user.role,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att skapa ärenden",
        requestId,
      });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const normalizedTitle = typeof body.title === "string" ? body.title.trim() : "";
    const normalizedDescription = typeof body.description === "string" ? body.description.trim() : "";
    const normalizedPropertyId = typeof body.propertyId === "string" && body.propertyId.trim() ? body.propertyId.trim() : null;
    const normalizedCategory = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "other";
    const normalizedPriority = typeof body.priority === "string" && body.priority.trim() ? body.priority.trim() : "normal";
    const normalizedAssignedToId = typeof body.assignedToId === "string" && body.assignedToId.trim() ? body.assignedToId.trim() : null;

    if (!normalizedTitle || !normalizedDescription) {
      logger.info("ticket create validation failed", {
        eventCode: "tickets.create.validation_failed",
        companyId: user.company_id,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Titel och beskrivning krävs",
        requestId,
      });
    }

    if (normalizedPropertyId) {
      const propertyActive = await notDeletedFilter("Property");
      const property = await db.property.findFirst({
        where: {
          id: normalizedPropertyId,
          company_id: user.company_id,
          ...propertyActive,
        },
        select: { id: true },
      });
      if (!property) {
        return apiErrorResponse({
          status: 400,
          code: API_ERROR_CODES.validationFailed,
          message: "Vald fastighet hittades inte",
          requestId,
        });
      }
    }

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
        return apiErrorResponse({
          status: 400,
          code: API_ERROR_CODES.validationFailed,
          message: "Vald ansvarig hittades inte",
          requestId,
        });
      }
    }

    const ticket = await db.ticket.create({
      data: {
        title: normalizedTitle,
        description: normalizedDescription,
        category: normalizedCategory,
        priority: normalizedPriority,
        due_date: calculateDueDate(normalizedPriority),
        property_id: normalizedPropertyId,
        assigned_to_id: normalizedAssignedToId,
        company_id: user.company_id,
        user_id: user.id,
      },
      select: ticketSelect,
    });

    const sideEffects = await Promise.allSettled([
      writeAuditLog(user, {
        entityType: "ticket",
        entityId: ticket.id,
        action: "ticket.created",
        metadata: {
          priority: ticket.priority,
          category: ticket.category,
          assignedToId: ticket.assigned_to_id,
          propertyId: ticket.property_id,
        },
      }),
      queueTicketNotification(user, {
        ticketId: ticket.id,
        title: ticket.title,
        recipient: user.email,
        event: "created",
      }),
      recordAiEvent(user, {
        ticketId: ticket.id,
        action: "classification.requested",
        category: ticket.category,
        priority: ticket.priority,
      }),
    ]);
    const failedSideEffects = sideEffects.filter((result) => result.status === "rejected").length;
    if (failedSideEffects > 0) {
      logger.warn("ticket created with partial side-effect failure", {
        eventCode: "tickets.create.partial_failure",
        companyId: user.company_id,
        ticketId: ticket.id,
        failedSideEffects,
        latencyMs: Date.now() - startedAt,
      });
    } else {
      logger.info("ticket create succeeded", {
        eventCode: "tickets.create.succeeded",
        companyId: user.company_id,
        ticketId: ticket.id,
        latencyMs: Date.now() - startedAt,
      });
    }

    return NextResponse.json(
      { success: true, ticket, requestId },
      { status: 201, headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.warn("ticket create schema unavailable", {
        eventCode: "tickets.create.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }

    logger.error("ticket create failed", error, {
      eventCode: "tickets.create.failed",
      latencyMs: Date.now() - startedAt,
    });
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId,
    });
  }
}
