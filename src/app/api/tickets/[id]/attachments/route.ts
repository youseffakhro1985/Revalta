import db from "@/lib/db";
import { canManageTickets, getCurrentUser, requireCompanyUser } from "@/lib/current-user";
import { validateUploadFile } from "@/lib/document-file-security";
import { recordStorageEvent } from "@/lib/integrations";
import {
  deleteStoredFile,
  StorageConfigurationError,
  storeAttachment,
  type StoredFile,
} from "@/lib/storage";
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
    route: "/api/tickets/[id]/attachments",
    method: "POST",
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
  let storedFile: StoredFile | null = null;

  try {
    const user = requireCompanyUser(await getCurrentUser());
    if (!user) {
      logger.warn("ticket attachment unauthorized", {
        eventCode: "tickets.attachments.create.unauthorized",
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
      logger.warn("ticket attachment forbidden", {
        eventCode: "tickets.attachments.create.forbidden",
        companyId: user.company_id,
        role: user.role,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att lägga till bilagor",
        requestId,
      });
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
      select: { id: true, assigned_to_id: true },
    });

    if (!ticket || !isAssignedWorkAccessible(user, ticket.assigned_to_id)) {
      logger.warn("ticket attachment target not found", {
        eventCode: "tickets.attachments.create.not_found",
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

    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");
    if (!(file instanceof File)) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Fil krävs",
        requestId,
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateUploadFile({
      bytes: buffer,
      contentType: file.type,
      fileName: file.name,
      profile: "attachment",
      maxBytes: 1024 * 1024,
    });
    if (!validation.ok) {
      logger.warn("ticket attachment validation failed", {
        eventCode: "tickets.attachments.create.validation_failed",
        companyId: user.company_id,
        ticketId: ticket.id,
        reason: "file_security",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: validation.error,
        requestId,
      });
    }

    storedFile = await storeAttachment({
      fileName: validation.fileName,
      contentType: validation.contentType,
      buffer,
      prefix: `tickets/${ticket.id}`,
    });

    const attachment = await db.$transaction(async (tx) => {
      const created = await tx.ticketAttachment.create({
        data: {
          ticket_id: ticket.id,
          file_name: validation.fileName,
          content_type: validation.contentType,
          size_bytes: validation.sizeBytes,
          data_url: storedFile!.url,
        },
        select: {
          id: true,
          file_name: true,
          content_type: true,
          size_bytes: true,
          data_url: true,
          created_at: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actor_user_id: user.id,
          company_id: user.company_id,
          entity_type: "ticket",
          entity_id: ticket.id,
          action: "ticket.attachment_created",
          metadata: {
            attachmentId: created.id,
            contentType: created.content_type,
            sizeBytes: created.size_bytes,
            provider: storedFile!.provider,
          },
        },
      });

      return created;
    });

    try {
      await recordStorageEvent(user, {
        ticketId: ticket.id,
        fileName: attachment.file_name,
        contentType: attachment.content_type,
        sizeBytes: attachment.size_bytes,
        provider: storedFile.provider,
      });
    } catch (error) {
      logger.warn("ticket attachment telemetry failed", {
        eventCode: "tickets.attachments.create.partial_failure",
        companyId: user.company_id,
        ticketId: ticket.id,
        attachmentId: attachment.id,
        error,
        latencyMs: Date.now() - startedAt,
      });
    }

    logger.info("ticket attachment created", {
      eventCode: "tickets.attachments.create.succeeded",
      companyId: user.company_id,
      ticketId: ticket.id,
      attachmentId: attachment.id,
      contentType: attachment.content_type,
      sizeBytes: attachment.size_bytes,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        success: true,
        attachment: {
          ...attachment,
          data_url: `/api/attachments/${attachment.id}`,
        },
      },
      { status: 201, headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (storedFile) {
      try {
        await deleteStoredFile(storedFile.url);
        logger.warn("orphaned ticket attachment compensated", {
          eventCode: "tickets.attachments.create.compensated",
          latencyMs: Date.now() - startedAt,
        });
      } catch (cleanupError) {
        logger.error("orphaned ticket attachment cleanup failed", {
          eventCode: "tickets.attachments.create.compensation_failed",
          error: cleanupError,
          latencyMs: Date.now() - startedAt,
        });
      }
    }

    if (error instanceof StorageConfigurationError) {
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: error.message,
        requestId,
      });
    }

    if (isMissingSchemaColumnError(error)) {
      logger.error("ticket attachment schema unavailable", {
        eventCode: "tickets.attachments.create.schema_unavailable",
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

    logger.error("ticket attachment creation failed", {
      eventCode: "tickets.attachments.create.failed",
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
