import db from "@/lib/db";
import { canManageTickets, getCurrentUser, requireCompanyUser } from "@/lib/current-user";
import { queueTicketNotification } from "@/lib/integrations";
import { isAssignedWorkAccessible } from "@/lib/assigned-work-access";
import {
  isMissingSchemaColumnError,
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = createLogger({
    route: "/api/tickets/[id]/comments",
    method: "POST",
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });

  try {
    const user = requireCompanyUser(await getCurrentUser());
    if (!user) {
      logger.warn("ticket comment unauthorized", {
        eventCode: "tickets.comments.create.unauthorized",
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
      logger.warn("ticket comment forbidden", {
        eventCode: "tickets.comments.create.forbidden",
        companyId: user.company_id,
        role: user.role,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att kommentera ärenden",
        requestId,
      });
    }

    const { id } = await params;
    const payload = (await request.json().catch(() => null)) as {
      body?: unknown;
      isInternal?: unknown;
    } | null;
    const normalizedBody = typeof payload?.body === "string" ? payload.body.trim() : "";

    if (!normalizedBody || normalizedBody.length > 10_000) {
      logger.warn("ticket comment validation failed", {
        eventCode: "tickets.comments.create.validation_failed",
        companyId: user.company_id,
        ticketId: id,
        reason: !normalizedBody ? "empty" : "too_long",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: !normalizedBody ? "Kommentar krävs" : "Kommentaren är för lång",
        requestId,
      });
    }

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
      select: { id: true, title: true, assigned_to_id: true },
    });

    if (!ticket || !isAssignedWorkAccessible(user, ticket.assigned_to_id)) {
      logger.warn("ticket comment target not found", {
        eventCode: "tickets.comments.create.not_found",
        companyId: user.company_id,
        ticketId: id,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Ärendet hittades inte",
        requestId,
      });
    }

    const isInternal = payload?.isInternal === true;
    const authorName = user.name || user.email;
    const comment = await db.$transaction(async (tx) => {
      const created = await tx.ticketComment.create({
        data: {
          ticket_id: ticket.id,
          user_id: user.id,
          body: normalizedBody,
          is_internal: isInternal,
          author_type: "staff",
          author_name: authorName,
          author_email: user.email,
        },
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
      });

      await tx.auditLog.create({
        data: {
          actor_user_id: user.id,
          company_id: user.company_id,
          entity_type: "ticket",
          entity_id: ticket.id,
          action: "ticket.comment_created",
          metadata: { commentId: created.id, isInternal: created.is_internal },
        },
      });

      return created;
    });

    try {
      await queueTicketNotification(user, {
        ticketId: ticket.id,
        title: ticket.title,
        recipient: user.email,
        event: "commented",
      });
    } catch (error) {
      logger.warn("ticket comment notification failed", {
        eventCode: "tickets.comments.create.partial_failure",
        companyId: user.company_id,
        ticketId: ticket.id,
        commentId: comment.id,
        error,
        latencyMs: Date.now() - startedAt,
      });
    }

    logger.info("ticket comment created", {
      eventCode: "tickets.comments.create.succeeded",
      companyId: user.company_id,
      ticketId: ticket.id,
      commentId: comment.id,
      isInternal: comment.is_internal,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      { success: true, comment },
      { status: 201, headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.error("ticket comment schema unavailable", {
        eventCode: "tickets.comments.create.schema_unavailable",
        error,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }

    logger.error("ticket comment creation failed", {
      eventCode: "tickets.comments.create.failed",
      error,
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
