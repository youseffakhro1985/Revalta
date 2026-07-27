import { get } from "@vercel/blob";
import db from "@/lib/db";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { extractPortalTrackingToken, verifyPortalTrackingToken } from "@/lib/portal-tracking";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";
import { isMissingSchemaColumnError, schemaMismatchUserMessage } from "@/lib/schema-readiness";
import { getStorageToken } from "@/lib/storage";
import { createLogger } from "@/lib/structured-logger";

const DOWNLOAD_LIMIT = 60;
const DOWNLOAD_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REFERENCE_PATTERN = /^[A-Z0-9][A-Z0-9-]{3,78}[A-Z0-9]$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const NOT_FOUND_MESSAGE = "Bilagan hittades inte.";

function safeFileName(fileName: string) {
  const normalized = fileName.replace(/[\r\n]/g, " ").trim().slice(0, 180) || "bilaga";
  const ascii = normalized.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 180) || "bilaga";
  return { normalized, ascii };
}

function downloadHeaders(requestId: string, contentType: string, fileName: string) {
  const { normalized, ascii } = safeFileName(fileName);
  return new Headers({
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(normalized)}`,
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    [REQUEST_ID_HEADER]: requestId,
  });
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
  { params }: { params: Promise<{ reference: string; id: string }> },
) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = createLogger({
    route: "/api/public/tickets/[reference]/attachments/[id]",
    method: "GET",
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });

  try {
    const rateLimit = await checkRateLimit(
      `public-attachment-download:${getClientIp(request)}`,
      DOWNLOAD_LIMIT,
      DOWNLOAD_WINDOW_MS,
    );
    if (!rateLimit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000));
      logger.warn("public attachment download rate limited", {
        eventCode: "public_tickets.attachment_download.rate_limited",
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

    const { reference: rawReference, id } = await params;
    const reference = rawReference?.trim().toUpperCase() ?? "";
    const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
    const tracking = verifyPortalTrackingToken(extractPortalTrackingToken(request));

    if (
      !REFERENCE_PATTERN.test(reference) ||
      !ID_PATTERN.test(id) ||
      (!tracking && !EMAIL_PATTERN.test(email)) ||
      (tracking && tracking.reference !== reference)
    ) {
      logger.warn("public attachment download rejected", {
        eventCode: "public_tickets.attachment_download.rejected",
        hasTrackingToken: Boolean(tracking),
        latencyMs: Date.now() - startedAt,
      });
      return notFoundResponse(requestId);
    }

    const authorizedEmail = tracking?.email ?? email;
    const attachment = await db.ticketAttachment.findFirst({
      where: {
        id,
        visibility: "public",
        ticket: {
          public_reference: reference,
          reporter_email: authorizedEmail,
          deleted_at: null,
          OR: [{ property_id: null }, { property: { deleted_at: null } }],
          ...(tracking ? { company_id: tracking.companyId } : {}),
        },
      },
      select: {
        id: true,
        file_name: true,
        content_type: true,
        size_bytes: true,
        data_url: true,
        ticket: { select: { id: true, company_id: true } },
      },
    });

    if (!attachment?.ticket.company_id) {
      logger.warn("public attachment download not found", {
        eventCode: "public_tickets.attachment_download.not_found",
        hasTrackingToken: Boolean(tracking),
        latencyMs: Date.now() - startedAt,
      });
      return notFoundResponse(requestId);
    }

    const headers = downloadHeaders(requestId, attachment.content_type, attachment.file_name);

    if (attachment.data_url.startsWith("data:")) {
      const encoded = attachment.data_url.split(",", 2)[1];
      if (!encoded) {
        logger.error("public legacy attachment corrupt", undefined, {
          eventCode: "public_tickets.attachment_download.corrupt",
          companyId: attachment.ticket.company_id,
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
      logger.info("public legacy attachment downloaded", {
        eventCode: "public_tickets.attachment_download.succeeded",
        companyId: attachment.ticket.company_id,
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
      logger.error("public attachment storage unavailable", undefined, {
        eventCode: "public_tickets.attachment_download.storage_unavailable",
        companyId: attachment.ticket.company_id,
        ticketId: attachment.ticket.id,
        attachmentId: attachment.id,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: "Filhämtning är tillfälligt inte tillgänglig",
        requestId,
      });
    }

    const blob = await get(attachment.data_url, { access: "private", token });
    if (!blob) return notFoundResponse(requestId);

    logger.info("public attachment downloaded", {
      eventCode: "public_tickets.attachment_download.succeeded",
      companyId: attachment.ticket.company_id,
      ticketId: attachment.ticket.id,
      attachmentId: attachment.id,
      storageMode: "vercel_blob",
      sizeBytes: attachment.size_bytes,
      latencyMs: Date.now() - startedAt,
    });
    return new Response(blob.stream, { status: 200, headers });
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.error("public attachment download schema unavailable", error, {
        eventCode: "public_tickets.attachment_download.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }

    logger.error("public attachment download failed", error, {
      eventCode: "public_tickets.attachment_download.failed",
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
