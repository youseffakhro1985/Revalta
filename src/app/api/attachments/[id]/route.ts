import { get } from "@vercel/blob";
import db from "@/lib/db";
import { getCurrentUser, requireCompanyUser } from "@/lib/current-user";
import { getStorageToken } from "@/lib/storage";
import { isAssignedWorkAccessible } from "@/lib/assigned-work-access";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";
import { createLogger } from "@/lib/structured-logger";
import { isMissingSchemaColumnError, schemaMismatchUserMessage } from "@/lib/schema-readiness";

function safeFileName(fileName: string) {
  const normalized = fileName.replace(/[\r\n]/g, " ").trim().slice(0, 180) || "bilaga";
  const ascii = normalized.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 180) || "bilaga";
  return { normalized, ascii };
}

function contentDisposition(fileName: string) {
  const { normalized, ascii } = safeFileName(fileName);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(normalized)}`;
}

function privateHeaders(requestId: string, contentType?: string, fileName?: string) {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    [REQUEST_ID_HEADER]: requestId,
  });
  if (contentType) headers.set("Content-Type", contentType);
  if (fileName) headers.set("Content-Disposition", contentDisposition(fileName));
  return headers;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = createLogger({
    route: "/api/attachments/[id]",
    method: "GET",
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });

  try {
    const user = requireCompanyUser(await getCurrentUser());
    if (!user) {
      logger.warn("attachment download unauthorized", {
        eventCode: "tickets.attachments.download.unauthorized",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        requestId,
      });
    }

    const { id } = await params;
    const attachment = await db.ticketAttachment.findFirst({
      where: {
        id,
        ticket: {
          company_id: user.company_id,
          deleted_at: null,
          OR: [
            { property_id: null },
            { property: { company_id: user.company_id, deleted_at: null } },
          ],
        },
      },
      select: {
        id: true,
        file_name: true,
        content_type: true,
        size_bytes: true,
        data_url: true,
        ticket: { select: { id: true, assigned_to_id: true } },
      },
    });

    if (!attachment || !isAssignedWorkAccessible(user, attachment.ticket.assigned_to_id)) {
      logger.warn("attachment download not found", {
        eventCode: "tickets.attachments.download.not_found",
        companyId: user.company_id,
        attachmentId: id,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Bilagan hittades inte",
        requestId,
      });
    }

    const headers = privateHeaders(requestId, attachment.content_type, attachment.file_name);

    if (attachment.data_url.startsWith("data:")) {
      const encoded = attachment.data_url.split(",", 2)[1];
      if (!encoded) {
        logger.error("legacy attachment payload corrupt", {
          eventCode: "tickets.attachments.download.corrupt",
          companyId: user.company_id,
          ticketId: attachment.ticket.id,
          attachmentId: attachment.id,
          latencyMs: Date.now() - startedAt,
        });
        return apiErrorResponse({
          status: 500,
          code: API_ERROR_CODES.internalError,
          message: "Bilagan kunde inte läsas",
          requestId,
        });
      }

      const bytes = Buffer.from(encoded, "base64");
      logger.info("legacy attachment downloaded", {
        eventCode: "tickets.attachments.download.succeeded",
        companyId: user.company_id,
        ticketId: attachment.ticket.id,
        attachmentId: attachment.id,
        storageMode: "legacy_data_url",
        sizeBytes: bytes.byteLength,
        latencyMs: Date.now() - startedAt,
      });
      return new Response(bytes, { status: 200, headers });
    }

    const token = getStorageToken();
    if (!token) {
      logger.error("attachment storage unavailable", {
        eventCode: "tickets.attachments.download.storage_unavailable",
        companyId: user.company_id,
        ticketId: attachment.ticket.id,
        attachmentId: attachment.id,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: "Fillagringen är inte konfigurerad",
        requestId,
      });
    }

    const blob = await get(attachment.data_url, { access: "private", token });
    if (!blob) {
      logger.warn("attachment blob not found", {
        eventCode: "tickets.attachments.download.blob_not_found",
        companyId: user.company_id,
        ticketId: attachment.ticket.id,
        attachmentId: attachment.id,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Bilagan hittades inte i fillagringen",
        requestId,
      });
    }

    logger.info("attachment downloaded", {
      eventCode: "tickets.attachments.download.succeeded",
      companyId: user.company_id,
      ticketId: attachment.ticket.id,
      attachmentId: attachment.id,
      storageMode: "vercel_blob",
      sizeBytes: attachment.size_bytes,
      latencyMs: Date.now() - startedAt,
    });
    return new Response(blob.stream, { status: 200, headers });
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.error("attachment schema unavailable", {
        eventCode: "tickets.attachments.download.schema_unavailable",
        latencyMs: Date.now() - startedAt,
        error,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }

    logger.error("attachment download failed", {
      eventCode: "tickets.attachments.download.failed",
      latencyMs: Date.now() - startedAt,
      error,
    });
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId,
    });
  }
}
