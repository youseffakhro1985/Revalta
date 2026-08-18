import { get } from "@vercel/blob";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { getCurrentUser, type CompanyUser } from "@/lib/current-user";
import { isOperationalDocumentAccessible } from "@/lib/operational-document-access";
import { getStorageToken } from "@/lib/storage";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/operational-documents/[id]/download";

function contentDisposition(fileName: string) {
  const safeAscii = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `inline; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function isTrustedLegacyBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

function unavailable(
  observability: ReturnType<typeof createRouteObservability>,
  options: {
    status: number;
    code: Parameters<typeof apiErrorResponse>[0]["code"];
    message: string;
    event: string;
    context?: Record<string, unknown>;
  },
) {
  observability.logger.warn("operational document download unavailable", observability.elapsed({
    event: options.event,
    ...options.context,
  }));
  return apiErrorResponse({
    status: options.status,
    code: options.code,
    message: options.message,
    requestId: observability.requestId,
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return unavailable(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "operational_documents.download.unauthorized",
      });
    }
    if (!user.company_id) {
      return unavailable(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        event: "operational_documents.download.missing_company",
        context: { userId: user.id },
      });
    }

    const { id } = await params;
    const document = await db.operationalDocument.findFirst({
      where: { id, company_id: user.company_id, deleted_at: null },
      select: {
        id: true,
        file_name: true,
        storage_url: true,
        content_type: true,
        work_order_id: true,
        project_id: true,
        property_id: true,
        technical_asset_id: true,
      },
    });
    if (!document) {
      return unavailable(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Dokumentet hittades inte",
        event: "operational_documents.download.not_found",
        context: { userId: user.id, companyId: user.company_id },
      });
    }
    if (!(await isOperationalDocumentAccessible(user as CompanyUser, document))) {
      return unavailable(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Dokumentet hittades inte",
        event: "operational_documents.download.inaccessible",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const context = {
      userId: user.id,
      companyId: user.company_id,
      documentId: document.id,
    };
    const token = getStorageToken();
    if (!token) {
      return unavailable(observability, {
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: "Fillagringen är inte konfigurerad",
        event: "operational_documents.download.storage_unavailable",
        context,
      });
    }

    const headers = new Headers({
      "Content-Type": document.content_type,
      "Content-Disposition": contentDisposition(document.file_name),
      "Cache-Control": "private, no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });

    try {
      const blob = await get(document.storage_url, { access: "private", token });
      if (blob) {
        observability.logger.info("operational document download completed", observability.elapsed({
          event: "operational_documents.download.completed",
          ...context,
          storage: "private_blob",
        }));
        return observability.correlate(new Response(blob.stream, { headers }));
      }
    } catch (error) {
      if (!isTrustedLegacyBlobUrl(document.storage_url)) throw error;
    }

    if (!isTrustedLegacyBlobUrl(document.storage_url)) {
      return unavailable(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Dokumentet hittades inte i fillagringen",
        event: "operational_documents.download.file_missing",
        context,
      });
    }

    const legacyResponse = await fetch(document.storage_url, { cache: "no-store" });
    if (!legacyResponse.ok || !legacyResponse.body) {
      return unavailable(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Dokumentet hittades inte i fillagringen",
        event: "operational_documents.download.legacy_file_missing",
        context,
      });
    }

    observability.logger.info("operational document download completed", observability.elapsed({
      event: "operational_documents.download.completed",
      ...context,
      storage: "legacy_blob_url",
    }));
    return observability.correlate(new Response(legacyResponse.body, { headers }));
  } catch (error) {
    observability.logger.error("operational document download failed", error, observability.elapsed({
      event: "operational_documents.download.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
