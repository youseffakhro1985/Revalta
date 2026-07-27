import db from "@/lib/db";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { validateUploadFile } from "@/lib/document-file-security";
import { recordStorageEvent } from "@/lib/integrations";
import { extractPortalTrackingToken, verifyPortalTrackingToken } from "@/lib/portal-tracking";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";
import { isMissingSchemaColumnError, schemaMismatchUserMessage } from "@/lib/schema-readiness";
import {
  deleteStoredFile,
  StorageConfigurationError,
  storeAttachment,
} from "@/lib/storage";
import { createLogger } from "@/lib/structured-logger";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

const PUBLIC_ATTACHMENT_LIMIT = 10;
const PUBLIC_ATTACHMENT_WINDOW_MS = 60 * 60 * 1000;
const MAX_PUBLIC_ATTACHMENT_BYTES = 1024 * 1024;
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
    route: "/api/public/tickets/[reference]/attachments",
    method: "POST",
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });

  try {
    const rateLimit = await checkRateLimit(
      `public-attachment:${getClientIp(request)}`,
      PUBLIC_ATTACHMENT_LIMIT,
      PUBLIC_ATTACHMENT_WINDOW_MS,
    );
    if (!rateLimit.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000),
      );
      logger.warn("public ticket attachment upload rate limited", {
        eventCode: "public_tickets.attachment.rate_limited",
        rateLimitSource: rateLimit.source,
        retryAfterSeconds: retryAfter,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 429,
        code: API_ERROR_CODES.rateLimited,
        message: "För många uppladdningar. Vänta en stund och prova igen.",
        requestId,
        headers: { "Retry-After": String(retryAfter) },
      });
    }

    const { reference: rawReference } = await params;
    const reference = rawReference?.trim().toUpperCase() ?? "";
    if (!REFERENCE_PATTERN.test(reference)) {
      logger.warn("public ticket attachment rejected", {
        eventCode: "public_tickets.attachment.rejected",
        reason: "invalid_reference",
        latencyMs: Date.now() - startedAt,
      });
      return notFoundResponse(requestId);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ogiltig uppladdning",
        requestId,
      });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Fil krävs",
        requestId,
      });
    }

    const email = String(formData.get("email") || "").trim().toLowerCase();
    const tracking = verifyPortalTrackingToken(extractPortalTrackingToken(request, formData));
    const authorizedEmail = tracking?.email ?? email;
    const validEmail = authorizedEmail.length <= 254 && EMAIL_PATTERN.test(authorizedEmail);
    const validTracking = !tracking || tracking.reference === reference;

    if (!validEmail || !validTracking) {
      logger.warn("public ticket attachment rejected", {
        eventCode: "public_tickets.attachment.rejected",
        reason: "invalid_credentials",
        usedTrackingToken: Boolean(tracking),
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
        company_id: true,
        user_id: true,
      },
    });

    if (!ticket?.company_id || !ticket.user_id) {
      logger.warn("public ticket attachment target not found", {
        eventCode: "public_tickets.attachment.not_found",
        usedTrackingToken: Boolean(tracking),
        latencyMs: Date.now() - startedAt,
      });
      return notFoundResponse(requestId);
    }

    if (file.size <= 0 || file.size > MAX_PUBLIC_ATTACHMENT_BYTES) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: `Filen måste vara mellan 1 byte och ${MAX_PUBLIC_ATTACHMENT_BYTES} byte`,
        requestId,
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateUploadFile({
      bytes: buffer,
      contentType: file.type,
      fileName: file.name,
      profile: "attachment",
      maxBytes: MAX_PUBLIC_ATTACHMENT_BYTES,
    });
    if (!validation.ok) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: validation.error,
        requestId,
      });
    }

    const storedFile = await storeAttachment({
      fileName: validation.fileName,
      contentType: validation.contentType,
      buffer,
      prefix: `public-tickets/${ticket.id}`,
    });

    let attachment: {
      id: string;
      file_name: string;
      content_type: string;
      size_bytes: number;
      created_at: Date;
    };

    try {
      attachment = await db.$transaction(async (tx) => {
        const created = await tx.ticketAttachment.create({
          data: {
            ticket_id: ticket.id,
            file_name: validation.fileName,
            content_type: validation.contentType,
            size_bytes: validation.sizeBytes,
            data_url: storedFile.url,
            visibility: "public",
          },
          select: {
            id: true,
            file_name: true,
            content_type: true,
            size_bytes: true,
            created_at: true,
          },
        });

        await tx.auditLog.create({
          data: {
            company_id: ticket.company_id,
            actor_user_id: ticket.user_id,
            entity_type: "ticket",
            entity_id: ticket.id,
            action: "public.attachment_created",
            metadata: {
              attachmentId: created.id,
              fileName: created.file_name,
              contentType: created.content_type,
              sizeBytes: created.size_bytes,
              source: "public_portal",
              schemaVersion: 2,
            } as Prisma.InputJsonValue,
          },
        });

        return created;
      });
    } catch (error) {
      try {
        await deleteStoredFile(storedFile.url);
      } catch (cleanupError) {
        logger.error("public ticket attachment compensation failed", cleanupError, {
          eventCode: "public_tickets.attachment.cleanup_failed",
          ticketId: ticket.id,
          companyId: ticket.company_id,
        });
      }
      throw error;
    }

    try {
      await recordStorageEvent(
        { company_id: ticket.company_id },
        {
          ticketId: ticket.id,
          fileName: attachment.file_name,
          source: "public_portal",
          provider: storedFile.provider,
        },
      );
    } catch (error) {
      logger.warn("public ticket attachment storage event failed", {
        eventCode: "public_tickets.attachment.storage_event_failed",
        ticketId: ticket.id,
        companyId: ticket.company_id,
        attachmentId: attachment.id,
        error,
      });
    }

    logger.info("public ticket attachment uploaded", {
      eventCode: "public_tickets.attachment.succeeded",
      ticketId: ticket.id,
      companyId: ticket.company_id,
      attachmentId: attachment.id,
      sizeBytes: attachment.size_bytes,
      contentType: attachment.content_type,
      usedTrackingToken: Boolean(tracking),
      rateLimitSource: rateLimit.source,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      { success: true, attachment },
      { status: 201, headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (error instanceof StorageConfigurationError) {
      logger.error("public ticket attachment storage unavailable", error, {
        eventCode: "public_tickets.attachment.storage_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: "Filuppladdning är tillfälligt inte tillgänglig",
        requestId,
      });
    }

    if (isMissingSchemaColumnError(error)) {
      logger.error("public ticket attachment schema unavailable", error, {
        eventCode: "public_tickets.attachment.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }

    logger.error("public ticket attachment upload failed", error, {
      eventCode: "public_tickets.attachment.failed",
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
