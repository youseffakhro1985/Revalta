import { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { queueTicketNotification } from "@/lib/integrations";
import { extractPortalTrackingToken, verifyPortalTrackingToken } from "@/lib/portal-tracking";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";
import { isMissingSchemaColumnError, schemaMismatchUserMessage } from "@/lib/schema-readiness";
import { createLogger } from "@/lib/structured-logger";
import { NextResponse } from "next/server";

const PUBLIC_COMMENT_LIMIT = 10;
const PUBLIC_COMMENT_WINDOW_MS = 60 * 60 * 1000;
const MAX_COMMENT_LENGTH = 5_000;
const MAX_AUTHOR_NAME_LENGTH = 120;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REFERENCE_PATTERN = /^[A-Z0-9][A-Z0-9-]{3,78}[A-Z0-9]$/;
const NOT_FOUND_MESSAGE = "Ärendet hittades inte. Kontrollera uppgifterna och försök igen.";

function successHeaders(requestId: string) {
  return {
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    [REQUEST_ID_HEADER]: requestId,
  };
}

function notFoundResponse(requestId: string) {
  return apiErrorResponse({
    status: 404,
    code: API_ERROR_CODES.notFound,
    message: NOT_FOUND_MESSAGE,
    requestId,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = createLogger({
    route: "/api/public/tickets/[reference]/comments",
    method: "POST",
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });

  try {
    const rateLimit = await checkRateLimit(
      `public-comment:${getClientIp(request)}`,
      PUBLIC_COMMENT_LIMIT,
      PUBLIC_COMMENT_WINDOW_MS,
    );
    if (!rateLimit.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000),
      );
      logger.warn("public ticket comment rate limited", {
        eventCode: "public_tickets.comment.rate_limited",
        rateLimitSource: rateLimit.source,
        retryAfterSeconds: retryAfter,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 429,
        code: API_ERROR_CODES.rateLimited,
        message: "För många kommentarer. Vänta en stund och prova igen.",
        requestId,
        headers: { "Retry-After": String(retryAfter) },
      });
    }

    const { reference: rawReference } = await params;
    const reference = rawReference?.trim().toUpperCase() ?? "";

    let bodyJson: Record<string, unknown>;
    try {
      const parsed = await request.json();
      bodyJson = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Begäran innehåller ogiltig JSON",
        requestId,
      });
    }

    const email = typeof bodyJson.email === "string" ? bodyJson.email.trim().toLowerCase() : "";
    const name = typeof bodyJson.name === "string" ? bodyJson.name.trim() : "";
    const commentBody = typeof bodyJson.body === "string" ? bodyJson.body.trim() : "";
    const token = typeof bodyJson.token === "string"
      ? bodyJson.token.trim()
      : extractPortalTrackingToken(request);
    const tracking = verifyPortalTrackingToken(token);
    const authorizedEmail = tracking?.email ?? email;

    const inputValid =
      REFERENCE_PATTERN.test(reference) &&
      EMAIL_PATTERN.test(authorizedEmail) &&
      authorizedEmail.length <= 254 &&
      commentBody.length > 0 &&
      commentBody.length <= MAX_COMMENT_LENGTH &&
      name.length <= MAX_AUTHOR_NAME_LENGTH;

    if (!inputValid) {
      logger.warn("public ticket comment rejected", {
        eventCode: "public_tickets.comment.rejected",
        hasTrackingToken: Boolean(token),
        trackingTokenValid: Boolean(tracking),
        latencyMs: Date.now() - startedAt,
      });
      return notFoundResponse(requestId);
    }

    if (tracking && tracking.reference !== reference) {
      logger.warn("public ticket comment rejected", {
        eventCode: "public_tickets.comment.rejected",
        hasTrackingToken: true,
        trackingTokenValid: true,
        reason: "reference_mismatch",
        latencyMs: Date.now() - startedAt,
      });
      return notFoundResponse(requestId);
    }

    const ticket = await db.ticket.findFirst({
      where: {
        public_reference: reference,
        reporter_email: authorizedEmail,
        deleted_at: null,
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
        ...(tracking ? { company_id: tracking.companyId } : {}),
      },
      select: {
        id: true,
        title: true,
        company_id: true,
        user_id: true,
        reporter_name: true,
        reporter_email: true,
      },
    });

    if (!ticket?.company_id || !ticket.user_id) {
      logger.warn("public ticket comment target not found", {
        eventCode: "public_tickets.comment.not_found",
        usedTrackingToken: Boolean(tracking),
        latencyMs: Date.now() - startedAt,
      });
      return notFoundResponse(requestId);
    }

    const authorName = name || ticket.reporter_name || "Boende";
    const authorEmail = ticket.reporter_email || authorizedEmail;

    const comment = await db.$transaction(async (tx) => {
      const created = await tx.ticketComment.create({
        data: {
          ticket_id: ticket.id,
          user_id: ticket.user_id,
          body: commentBody,
          is_internal: false,
          author_type: "resident",
          author_name: authorName,
          author_email: authorEmail,
        },
        select: {
          id: true,
          body: true,
          created_at: true,
          author_type: true,
          author_name: true,
        },
      });

      await tx.auditLog.create({
        data: {
          company_id: ticket.company_id,
          actor_user_id: ticket.user_id,
          entity_type: "ticket",
          entity_id: ticket.id,
          action: "public.comment_created",
          metadata: {
            reporterName: authorName,
            reporterEmail: authorEmail,
            commentId: created.id,
            schemaVersion: 2,
          } as Prisma.InputJsonValue,
        },
      });

      return created;
    });

    let notificationFailed = false;
    try {
      await queueTicketNotification(
        { company_id: ticket.company_id },
        {
          ticketId: ticket.id,
          title: ticket.title,
          recipient: authorizedEmail,
          event: "commented",
        },
      );
    } catch (error) {
      notificationFailed = true;
      logger.warn("public ticket comment notification failed", {
        eventCode: "public_tickets.comment.notification_failed",
        ticketId: ticket.id,
        companyId: ticket.company_id,
        errorName: error instanceof Error ? error.name : "UnknownError",
        latencyMs: Date.now() - startedAt,
      });
    }

    logger.info("public ticket comment created", {
      eventCode: "public_tickets.comment.succeeded",
      ticketId: ticket.id,
      companyId: ticket.company_id,
      commentId: comment.id,
      usedTrackingToken: Boolean(tracking),
      notificationFailed,
      rateLimitSource: rateLimit.source,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        success: true,
        comment: {
          id: comment.id,
          body: comment.body,
          created_at: comment.created_at,
          author: { type: "resident", name: comment.author_name || authorName },
        },
      },
      { status: 201, headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.error("public ticket comment schema unavailable", error, {
        eventCode: "public_tickets.comment.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }

    logger.error("public ticket comment failed", error, {
      eventCode: "public_tickets.comment.failed",
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
