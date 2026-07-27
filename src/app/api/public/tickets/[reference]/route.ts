import db from "@/lib/db";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import {
  createPortalTrackingToken,
  extractPortalTrackingToken,
  verifyPortalTrackingToken,
} from "@/lib/portal-tracking";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";
import {
  isMissingSchemaColumnError,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";
import { createLogger } from "@/lib/structured-logger";
import { NextResponse } from "next/server";

const PUBLIC_TRACK_LIMIT = 20;
const PUBLIC_TRACK_WINDOW_MS = 60 * 60 * 1000;
const MAX_PUBLIC_COMMENTS = 200;
const MAX_PUBLIC_ATTACHMENTS = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REFERENCE_PATTERN = /^[A-Z0-9][A-Z0-9-]{3,78}[A-Z0-9]$/;

const NOT_FOUND_MESSAGE = "Ärendet hittades inte. Kontrollera uppgifterna och försök igen.";

type PublicCommentAuditMetadata = {
  commentId?: unknown;
  reporterName?: unknown;
  reporterEmail?: unknown;
};

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = createLogger({
    route: "/api/public/tickets/[reference]",
    method: "GET",
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });

  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(
      `public-track:${ip}`,
      PUBLIC_TRACK_LIMIT,
      PUBLIC_TRACK_WINDOW_MS,
    );
    if (!rateLimit.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000),
      );
      logger.warn("public ticket tracking rate limited", {
        eventCode: "public_tickets.track.rate_limited",
        rateLimitSource: rateLimit.source,
        retryAfterSeconds: retryAfter,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 429,
        code: API_ERROR_CODES.rateLimited,
        message: "För många försök. Vänta en stund och prova igen.",
        requestId,
        headers: { "Retry-After": String(retryAfter) },
      });
    }

    const { reference: rawReference } = await params;
    const reference = rawReference?.trim().toUpperCase() ?? "";
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email")?.trim().toLowerCase() ?? "";
    const tracking = verifyPortalTrackingToken(extractPortalTrackingToken(request));

    if (
      !REFERENCE_PATTERN.test(reference) ||
      (!tracking && !EMAIL_PATTERN.test(email)) ||
      (tracking && tracking.reference !== reference)
    ) {
      logger.warn("public ticket tracking authorization rejected", {
        eventCode: "public_tickets.track.rejected",
        hasTrackingToken: Boolean(tracking),
        latencyMs: Date.now() - startedAt,
      });
      return notFoundResponse(requestId);
    }

    const authorizedEmail = tracking?.email ?? email;
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
        company_id: true,
        reporter_name: true,
        public_reference: true,
        title: true,
        status: true,
        priority: true,
        category: true,
        created_at: true,
        updated_at: true,
        ai_summary: true,
        property: { select: { name: true, address: true, city: true } },
        comments: {
          where: { is_internal: false },
          orderBy: [{ created_at: "asc" }, { id: "asc" }],
          take: MAX_PUBLIC_COMMENTS,
          select: {
            id: true,
            body: true,
            created_at: true,
            author_type: true,
            author_name: true,
            user: { select: { name: true } },
          },
        },
        attachments: {
          where: { visibility: "public" },
          orderBy: [{ created_at: "asc" }, { id: "asc" }],
          take: MAX_PUBLIC_ATTACHMENTS,
          select: {
            id: true,
            file_name: true,
            content_type: true,
            size_bytes: true,
            created_at: true,
          },
        },
      },
    });

    if (!ticket?.company_id) {
      logger.warn("public ticket tracking not found", {
        eventCode: "public_tickets.track.not_found",
        hasTrackingToken: Boolean(tracking),
        latencyMs: Date.now() - startedAt,
      });
      return notFoundResponse(requestId);
    }

    const legacyCommentIds = ticket.comments
      .filter((comment) => !comment.author_name)
      .map((comment) => comment.id);

    const externalAuthors = new Map<string, { type: "resident"; name: string }>();
    if (legacyCommentIds.length > 0) {
      const externalAuthorLogs = await db.auditLog.findMany({
        where: {
          company_id: ticket.company_id,
          entity_type: "ticket",
          entity_id: ticket.id,
          action: "public.comment_created",
        },
        orderBy: { created_at: "asc" },
        select: { metadata: true },
      });

      const legacyCommentIdSet = new Set(legacyCommentIds);
      for (const log of externalAuthorLogs) {
        const metadata = (log.metadata || {}) as PublicCommentAuditMetadata;
        if (typeof metadata.commentId !== "string") continue;
        if (!legacyCommentIdSet.has(metadata.commentId)) continue;
        const name =
          typeof metadata.reporterName === "string" && metadata.reporterName.trim()
            ? metadata.reporterName.trim().slice(0, 120)
            : ticket.reporter_name?.trim().slice(0, 120) || "Boende";
        externalAuthors.set(metadata.commentId, { type: "resident", name });
      }
    }

    const publicReference = ticket.public_reference || reference;
    const trackingToken = createPortalTrackingToken({
      reference: publicReference,
      email: authorizedEmail,
      companyId: ticket.company_id,
    });

    logger.info("public ticket tracking succeeded", {
      eventCode: "public_tickets.track.succeeded",
      companyId: ticket.company_id,
      ticketId: ticket.id,
      commentCount: ticket.comments.length,
      attachmentCount: ticket.attachments.length,
      usedTrackingToken: Boolean(tracking),
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        trackingToken,
        ticket: {
          public_reference: publicReference,
          title: ticket.title,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.category,
          created_at: ticket.created_at,
          updated_at: ticket.updated_at,
          ai_summary: ticket.ai_summary,
          property: ticket.property,
          attachments: ticket.attachments.map((attachment) => ({
            id: attachment.id,
            file_name: attachment.file_name,
            content_type: attachment.content_type,
            size_bytes: attachment.size_bytes,
            created_at: attachment.created_at,
            download_url: `/api/public/tickets/${encodeURIComponent(publicReference)}/attachments/${encodeURIComponent(attachment.id)}`,
          })),
          comments: ticket.comments.map((comment) => {
            if (comment.author_name) {
              return {
                id: comment.id,
                body: comment.body,
                created_at: comment.created_at,
                author: {
                  type:
                    comment.author_type === "resident"
                      ? ("resident" as const)
                      : ("management" as const),
                  name: comment.author_name,
                },
              };
            }
            return {
              id: comment.id,
              body: comment.body,
              created_at: comment.created_at,
              author: externalAuthors.get(comment.id) || {
                type: "management" as const,
                name: comment.user.name || "Förvaltningen",
              },
            };
          }),
        },
      },
      { headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.error("public ticket tracking schema unavailable", error, {
        eventCode: "public_tickets.track.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }

    logger.error("public ticket tracking failed", error, {
      eventCode: "public_tickets.track.failed",
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
