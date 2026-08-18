import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { auditScopedWhere, getCurrentUser } from "@/lib/current-user";
import { safeDocumentFileName } from "@/lib/document-file-security";
import { getStorageToken } from "@/lib/storage";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/documents/[id]/download";

function contentDisposition(fileName: string) {
  const safeAscii = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function isTrustedLegacyBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

function notFound(
  observability: ReturnType<typeof createRouteObservability>,
  message: string,
  event: string,
  context: Record<string, unknown> = {},
) {
  observability.logger.warn("document download unavailable", observability.elapsed({ event, ...context }));
  return apiErrorResponse({
    status: 404,
    code: API_ERROR_CODES.notFound,
    message,
    requestId: observability.requestId,
  });
}

async function streamFromStorage(
  storageUrl: string,
  headers: Record<string, string>,
  observability: ReturnType<typeof createRouteObservability>,
  context: { userId: string; companyId: string | null; documentId: string; source: string },
) {
  const token = getStorageToken();
  if (!token) {
    observability.logger.warn("document storage unavailable", observability.elapsed({
      event: "documents.download.storage_unavailable",
      ...context,
    }));
    return apiErrorResponse({
      status: 503,
      code: API_ERROR_CODES.serviceUnavailable,
      message: "Fillagringen är inte konfigurerad",
      requestId: observability.requestId,
    });
  }

  try {
    const blob = await get(storageUrl, { access: "private", token });
    if (blob) {
      observability.logger.info("document download completed", observability.elapsed({
        event: "documents.download.completed",
        ...context,
        storage: "private_blob",
      }));
      return observability.correlate(new Response(blob.stream, { headers }));
    }
  } catch (error) {
    if (!isTrustedLegacyBlobUrl(storageUrl)) throw error;
  }

  if (!isTrustedLegacyBlobUrl(storageUrl)) {
    return notFound(observability, "Dokumentfilen saknas", "documents.download.file_missing", context);
  }

  const legacyResponse = await fetch(storageUrl, { cache: "no-store" });
  if (!legacyResponse.ok || !legacyResponse.body) {
    return notFound(observability, "Dokumentfilen saknas", "documents.download.legacy_file_missing", context);
  }

  observability.logger.info("document download completed", observability.elapsed({
    event: "documents.download.completed",
    ...context,
    storage: "legacy_blob_url",
  }));
  return observability.correlate(new Response(legacyResponse.body, { headers }));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      observability.logger.warn("document download rejected", observability.elapsed({
        event: "documents.download.unauthorized",
      }));
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        requestId: observability.requestId,
      });
    }

    const { id } = await params;
    const context = {
      userId: user.id,
      companyId: user.company_id,
      documentId: id,
      source: "modern",
    };

    if (user.company_id) {
      const modern = await db.managedDocument.findFirst({
        where: { id, company_id: user.company_id },
        select: {
          file_name: true,
          content_type: true,
          storage_url: true,
          data_url: true,
        },
      });
      if (modern) {
        const headers = {
          "Content-Type": modern.content_type,
          "Content-Disposition": contentDisposition(safeDocumentFileName(modern.file_name)),
          "Cache-Control": "private, no-store, max-age=0",
          "CDN-Cache-Control": "no-store",
          "Vercel-CDN-Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        };
        if (modern.storage_url) return streamFromStorage(modern.storage_url, headers, observability, context);
        if (modern.data_url?.startsWith("data:")) {
          const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(modern.data_url);
          if (!match) return notFound(observability, "Dokumentfilen är ogiltig", "documents.download.invalid_data", context);
          const bytes = Buffer.from(match[2], "base64");
          observability.logger.info("document download completed", observability.elapsed({
            event: "documents.download.completed",
            ...context,
            storage: "inline_data",
          }));
          return observability.correlate(new Response(bytes, {
            headers: { ...headers, "Content-Length": String(bytes.length) },
          }));
        }
        return notFound(observability, "Dokumentfilen saknas", "documents.download.file_missing", context);
      }
    }

    const log = await db.auditLog.findFirst({
      where: {
        id,
        ...auditScopedWhere(user),
        entity_type: "document",
        action: "document.created",
      },
      select: { metadata: true },
    });
    if (!log) {
      return notFound(observability, "Dokumentet hittades inte", "documents.download.not_found", {
        userId: user.id,
        companyId: user.company_id,
        documentId: id,
      });
    }

    const legacyContext = {
      userId: user.id,
      companyId: user.company_id,
      documentId: id,
      source: "legacy",
    };
    const metadata = (log.metadata || {}) as Record<string, unknown>;
    const contentType = typeof metadata.contentType === "string" ? metadata.contentType : "application/octet-stream";
    const fileName = safeDocumentFileName(
      typeof metadata.fileName === "string" ? metadata.fileName : "dokument",
    );
    const headers = {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition(fileName),
      "Cache-Control": "private, no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };

    const storageUrl = typeof metadata.storageUrl === "string" ? metadata.storageUrl : null;
    if (storageUrl) return streamFromStorage(storageUrl, headers, observability, legacyContext);

    const dataUrl = typeof metadata.dataUrl === "string" ? metadata.dataUrl : null;
    if (!dataUrl?.startsWith("data:")) {
      return notFound(observability, "Dokumentfilen saknas", "documents.download.file_missing", legacyContext);
    }

    const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
    if (!match) return notFound(observability, "Dokumentfilen är ogiltig", "documents.download.invalid_data", legacyContext);

    const bytes = Buffer.from(match[2], "base64");
    observability.logger.info("document download completed", observability.elapsed({
      event: "documents.download.completed",
      ...legacyContext,
      storage: "inline_data",
    }));
    return observability.correlate(new Response(bytes, {
      headers: {
        ...headers,
        "Content-Type": typeof metadata.contentType === "string" ? metadata.contentType : match[1],
        "Content-Length": String(bytes.length),
      },
    }));
  } catch (error) {
    observability.logger.error("document download failed", error, observability.elapsed({
      event: "documents.download.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
