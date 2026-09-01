import db from "@/lib/db";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { canAssignWorkOrders, canExportTickets, canManageTickets, getCurrentUser, shouldScopeToAssignedWork, tenantWhere } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { queueTicketNotification, recordAiEvent } from "@/lib/integrations";
import { calculateDueDate } from "@/lib/sla";
import {
  isMissingSchemaColumnError,
  notDeletedFilter,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";
import { NextResponse } from "next/server";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/tickets";
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function positiveInteger(value: string | null, fallback: number, max?: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
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

export async function GET(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      observability.logger.warn("ticket list rejected", observability.elapsed({
        event: "tickets.list.unauthorized",
      }));
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        requestId: observability.requestId,
      });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const status = searchParams.get("status")?.trim();
    const priority = searchParams.get("priority")?.trim();
    const propertyId = searchParams.get("propertyId")?.trim();
    const assignedToId = searchParams.get("assignedToId")?.trim();
    const page = positiveInteger(searchParams.get("page"), 1);
    const pageSize = positiveInteger(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const ticketActive = await notDeletedFilter("Ticket");
    const scopedAssignedToId = shouldScopeToAssignedWork(user.role) ? user.id : assignedToId;
    const where = {
      ...ticketActive,
      ...tenantWhere(user),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(propertyId ? { property_id: propertyId } : {}),
      ...(scopedAssignedToId ? { assigned_to_id: scopedAssignedToId } : {}),
      AND: [
        { OR: [{ property_id: null }, { property: { deleted_at: null } }] },
        ...(q
          ? [{
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { description: { contains: q, mode: "insensitive" as const } },
              ],
            }]
          : []),
      ],
    };

    const [tickets, total] = await Promise.all([
      db.ticket.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
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
          property: {
            select: {
              id: true,
              name: true,
              address: true,
              city: true,
            },
          },
          assigned_to: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              comments: true,
            },
          },
        },
      }),
      db.ticket.count({ where }),
    ]);

    observability.logger.info("ticket list completed", observability.elapsed({
      event: "tickets.list.completed",
      userId: user.id,
      companyId: user.company_id,
      returned: tickets.length,
      total,
      page,
      pageSize,
    }));

    return successResponse(observability, {
      tickets,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      permissions: {
        canManage: canManageTickets(user.role),
        canExport: canExportTickets(user.role),
      },
    });
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      observability.logger.error("ticket list schema unavailable", error, observability.elapsed({
        event: "tickets.list.schema_unavailable",
      }));
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId: observability.requestId,
      });
    }

    observability.logger.error("ticket list failed", error, observability.elapsed({
      event: "tickets.list.failed",
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
      observability.logger.warn("ticket create rejected", observability.elapsed({
        event: "tickets.create.unauthorized",
      }));
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        requestId: observability.requestId,
      });
    }
    if (!canManageTickets(user.role)) {
      observability.logger.warn("ticket create forbidden", observability.elapsed({
        event: "tickets.create.forbidden",
        userId: user.id,
        companyId: user.company_id,
      }));
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att skapa ärenden",
        requestId: observability.requestId,
      });
    }

    const { title, description, propertyId, category, priority, assignedToId } = await request.json();
    const normalizedTitle = typeof title === "string" ? title.trim() : "";
    const normalizedDescription = typeof description === "string" ? description.trim() : "";
    const normalizedPropertyId = typeof propertyId === "string" && propertyId.trim() ? propertyId.trim() : null;
    const normalizedCategory = typeof category === "string" && category.trim() ? category.trim() : "other";
    const normalizedPriority = typeof priority === "string" && priority.trim() ? priority.trim() : "normal";
    const requestedAssigneeId = typeof assignedToId === "string" && assignedToId.trim() ? assignedToId.trim() : null;
    const canAssign = canAssignWorkOrders(user.role);
    if (!canAssign && requestedAssigneeId && requestedAssigneeId !== user.id) {
      observability.logger.warn("ticket assignment forbidden", observability.elapsed({
        event: "tickets.create.assignment_forbidden",
        userId: user.id,
        companyId: user.company_id,
      }));
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att tilldela ärenden till andra",
        requestId: observability.requestId,
      });
    }
    const normalizedAssignedToId = canAssign ? requestedAssigneeId : user.id;

    if (!normalizedTitle || !normalizedDescription) {
      observability.logger.warn("ticket create validation failed", observability.elapsed({
        event: "tickets.create.validation_failed",
        reason: "missing_required_fields",
        userId: user.id,
        companyId: user.company_id,
      }));
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Titel och beskrivning krävs",
        requestId: observability.requestId,
      });
    }
    if (normalizedTitle.length > 180 || normalizedDescription.length > 10_000) {
      observability.logger.warn("ticket create validation failed", observability.elapsed({
        event: "tickets.create.validation_failed",
        reason: "field_too_long",
        userId: user.id,
        companyId: user.company_id,
      }));
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Titel eller beskrivning är för lång",
        requestId: observability.requestId,
      });
    }
    if (!new Set(["other", "vvs", "electricity", "elevator", "security", "cleaning"]).has(normalizedCategory)) {
      observability.logger.warn("ticket create validation failed", observability.elapsed({
        event: "tickets.create.validation_failed",
        reason: "invalid_category",
        userId: user.id,
        companyId: user.company_id,
      }));
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ogiltig ärendekategori",
        requestId: observability.requestId,
      });
    }
    if (!new Set(["low", "normal", "high", "urgent"]).has(normalizedPriority)) {
      observability.logger.warn("ticket create validation failed", observability.elapsed({
        event: "tickets.create.validation_failed",
        reason: "invalid_priority",
        userId: user.id,
        companyId: user.company_id,
      }));
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ogiltig prioritet",
        requestId: observability.requestId,
      });
    }

    if (normalizedPropertyId) {
      const propertyActive = await notDeletedFilter("Property");
      const property = await db.property.findFirst({
        where: {
          id: normalizedPropertyId,
          ...propertyActive,
          ...tenantWhere(user),
        },
        select: { id: true },
      });

      if (!property) {
        observability.logger.warn("ticket create property rejected", observability.elapsed({
          event: "tickets.create.property_not_found",
          userId: user.id,
          companyId: user.company_id,
        }));
        return apiErrorResponse({
          status: 400,
          code: API_ERROR_CODES.validationFailed,
          message: "Vald fastighet hittades inte",
          requestId: observability.requestId,
        });
      }
    }

    if (normalizedAssignedToId) {
      const assignee = await db.user.findFirst({
        where: user.company_id
          ? { id: normalizedAssignedToId, company_id: user.company_id }
          : { id: user.id },
        select: { id: true },
      });

      if (!assignee || assignee.id !== normalizedAssignedToId) {
        observability.logger.warn("ticket create assignee rejected", observability.elapsed({
          event: "tickets.create.assignee_not_found",
          userId: user.id,
          companyId: user.company_id,
        }));
        return apiErrorResponse({
          status: 400,
          code: API_ERROR_CODES.validationFailed,
          message: "Vald ansvarig hittades inte",
          requestId: observability.requestId,
        });
      }
    }

    const ticket = await db.$transaction(async (tx) => {
      const created = await tx.ticket.create({
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
        select: {
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
          property: {
            select: {
              id: true,
              name: true,
              address: true,
              city: true,
            },
          },
          assigned_to: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              comments: true,
            },
          },
        },
      });
      await writeAuditLog(user, {
        entityType: "ticket",
        entityId: created.id,
        action: "ticket.created",
        metadata: {
          title: created.title,
          priority: created.priority,
          category: created.category,
          assignedToId: created.assigned_to_id,
        },
      }, tx);
      return created;
    });

    try {
      await queueTicketNotification(user, {
        ticketId: ticket.id,
        title: ticket.title,
        recipient: user.email,
        event: "created",
      });
    } catch {
      observability.logger.warn("ticket create notification failed", observability.elapsed({
        event: "tickets.create.notification_failed",
        userId: user.id,
        companyId: user.company_id,
        ticketId: ticket.id,
      }));
    }

    try {
      await recordAiEvent(user, {
        ticketId: ticket.id,
        action: "classification.requested",
        category: ticket.category,
        priority: ticket.priority,
      });
    } catch {
      observability.logger.warn("ticket create ai telemetry failed", observability.elapsed({
        event: "tickets.create.ai_telemetry_failed",
        userId: user.id,
        companyId: user.company_id,
        ticketId: ticket.id,
      }));
    }

    observability.logger.info("ticket create completed", observability.elapsed({
      event: "tickets.create.completed",
      userId: user.id,
      companyId: user.company_id,
      ticketId: ticket.id,
    }));
    return successResponse(observability, { success: true, ticket }, { status: 201 });
  } catch (error) {
    observability.logger.error("ticket create failed", error, observability.elapsed({
      event: "tickets.create.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
