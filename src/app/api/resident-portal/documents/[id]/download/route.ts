import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import {
  canDownloadResidentDocuments,
  getCurrentUser,
  isResident,
} from "@/lib/current-user";
import { leaseHolderEmailMatch } from "@/lib/resident-portal-scope";
import { getDocumentLifecycleState } from "@/lib/document-lifecycle";
import { allowedDocumentContentTypes, safeDocumentFileName, validateDocumentFile } from "@/lib/document-file-security";
import { getStorageToken } from "@/lib/storage";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/resident-portal/documents/[id]/download";
const activeLeaseStatuses = ["active", "notice"];
const residentDocumentVisibilities = new Set([
  "resident_all",
  "resident_property",
  "resident_unit",
  "resident_lease",
]);

type DocumentMetadata = {
  name?: unknown;
  visibility?: unknown;
  propertyId?: unknown;
  unitId?: unknown;
  leaseId?: unknown;
  fileName?: unknown;
  contentType?: unknown;
  sizeBytes?: unknown;
  dataUrl?: unknown;
  storageUrl?: unknown;
  storage?: unknown;
};

function documentAccessibleToLease(
  visibility: string,
  scope: { propertyId: string | null; unitId: string | null; leaseId: string | null },
  lease: { id: string; property_id: string; unit_id: string },
) {
  if (visibility === "resident_all") return true;
  if (visibility === "resident_property") return scope.propertyId === lease.property_id;
  if (visibility === "resident_unit") return scope.unitId === lease.unit_id;
  if (visibility === "resident_lease") return scope.leaseId === lease.id;
  return false;
}

function isTrustedLegacyBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

async function bytesFromStorage(storageUrl: string) {
  const token = getStorageToken();
  if (!token) throw new Error("storage_unconfigured");

  try {
    const blob = await get(storageUrl, { access: "private", token });
    if (blob?.stream) {
      const response = new Response(blob.stream);
      return Buffer.from(await response.arrayBuffer());
    }
  } catch (error) {
    if (!isTrustedLegacyBlobUrl(storageUrl)) throw error;
  }

  if (!isTrustedLegacyBlobUrl(storageUrl)) return null;
  const legacyResponse = await fetch(storageUrl, { cache: "no-store" });
  if (!legacyResponse.ok) return null;
  return Buffer.from(await legacyResponse.arrayBuffer());
}

function bytesFromDataUrl(dataUrl: string, contentType: string) {
  const prefix = `data:${contentType};base64,`;
  if (!dataUrl.startsWith(prefix) && !dataUrl.startsWith("data:")) return null;
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return null;
  return Buffer.from(match[2], "base64");
}

function reject(
  observability: ReturnType<typeof createRouteObservability>,
  options: {
    status: number;
    code: Parameters<typeof apiErrorResponse>[0]["code"];
    message: string;
    event: string;
    context?: Record<string, unknown>;
  },
) {
  observability.logger.warn("resident document download unavailable", observability.elapsed({
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
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "resident_documents.download.unauthorized",
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        event: "resident_documents.download.missing_company",
        context: { userId: user.id },
      });
    }
    if (!canDownloadResidentDocuments(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet till boendedokument",
        event: "resident_documents.download.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const { id } = await params;
    const leaseId = new URL(request.url).searchParams.get("leaseId")?.trim() || "";
    if (!leaseId) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Hyresavtal krävs",
        event: "resident_documents.download.validation_failed",
        context: { reason: "missing_lease", userId: user.id, companyId: user.company_id },
      });
    }
    const residentView = isResident(user.role);

    const lease = await db.lease.findFirst({
      where: {
        id: leaseId,
        company_id: user.company_id,
        deleted_at: null,
        status: { in: activeLeaseStatuses },
        property: { deleted_at: null },
        ...(residentView ? { lease_holder: leaseHolderEmailMatch(user.email) } : {}),
      },
      select: { id: true, property_id: true, unit_id: true, lease_number: true },
    });
    if (!lease) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Dokumentet hittades inte",
        event: "resident_documents.download.lease_not_found",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const modern = await db.managedDocument.findFirst({
      where: { id, company_id: user.company_id },
      select: {
        id: true,
        name: true,
        visibility: true,
        property_id: true,
        unit_id: true,
        lease_id: true,
        file_name: true,
        content_type: true,
        size_bytes: true,
        storage_url: true,
        data_url: true,
        lifecycle_state: true,
      },
    });

    let documentId = "";
    let visibility = "";
    let contentType = "";
    let fileName = "dokument";
    let expectedSize: number | null = null;
    let bytes: Buffer | null = null;

    if (modern) {
      if (modern.lifecycle_state !== "active") {
        return reject(observability, {
          status: 410,
          code: API_ERROR_CODES.notFound,
          message: "Dokumentet är inte längre publicerat",
          event: "resident_documents.download.inactive",
          context: { userId: user.id, companyId: user.company_id, leaseId: lease.id },
        });
      }
      visibility = modern.visibility;
      if (
        !residentDocumentVisibilities.has(visibility)
        || !documentAccessibleToLease(visibility, {
          propertyId: modern.property_id,
          unitId: modern.unit_id,
          leaseId: modern.lease_id,
        }, lease)
      ) {
        return reject(observability, {
          status: 403,
          code: API_ERROR_CODES.forbidden,
          message: "Du saknar behörighet till dokumentet",
          event: "resident_documents.download.scope_forbidden",
          context: { userId: user.id, companyId: user.company_id, leaseId: lease.id },
        });
      }

      documentId = modern.id;
      contentType = modern.content_type;
      fileName = modern.file_name || modern.name;
      expectedSize = modern.size_bytes;
      if (modern.storage_url) {
        try {
          bytes = await bytesFromStorage(modern.storage_url);
        } catch (error) {
          if (error instanceof Error && error.message === "storage_unconfigured") {
            return reject(observability, {
              status: 503,
              code: API_ERROR_CODES.serviceUnavailable,
              message: "Fillagringen är inte konfigurerad",
              event: "resident_documents.download.storage_unavailable",
              context: { userId: user.id, companyId: user.company_id, leaseId: lease.id, documentId },
            });
          }
          throw error;
        }
      } else if (modern.data_url) {
        bytes = bytesFromDataUrl(modern.data_url, modern.content_type);
      }
    } else {
      const documentLog = await db.auditLog.findFirst({
        where: {
          id,
          company_id: user.company_id,
          entity_type: "document",
          action: "document.created",
        },
        select: { id: true, metadata: true },
      });
      if (!documentLog) {
        return reject(observability, {
          status: 404,
          code: API_ERROR_CODES.notFound,
          message: "Dokumentet hittades inte",
          event: "resident_documents.download.not_found",
          context: { userId: user.id, companyId: user.company_id, leaseId: lease.id },
        });
      }

      const lifecycle = await getDocumentLifecycleState(user.company_id, documentLog.id);
      if (lifecycle.state !== "active") {
        return reject(observability, {
          status: 410,
          code: API_ERROR_CODES.notFound,
          message: "Dokumentet är inte längre publicerat",
          event: "resident_documents.download.inactive",
          context: { userId: user.id, companyId: user.company_id, leaseId: lease.id },
        });
      }

      const metadata = (documentLog.metadata || {}) as DocumentMetadata;
      if (metadata.storage === "ManagedDocument") {
        return reject(observability, {
          status: 404,
          code: API_ERROR_CODES.notFound,
          message: "Dokumentet hittades inte",
          event: "resident_documents.download.managed_marker_missing",
          context: { userId: user.id, companyId: user.company_id, leaseId: lease.id },
        });
      }

      visibility = typeof metadata.visibility === "string" ? metadata.visibility : "internal";
      const scope = {
        propertyId: typeof metadata.propertyId === "string" ? metadata.propertyId : null,
        unitId: typeof metadata.unitId === "string" ? metadata.unitId : null,
        leaseId: typeof metadata.leaseId === "string" ? metadata.leaseId : null,
      };
      if (!residentDocumentVisibilities.has(visibility) || !documentAccessibleToLease(visibility, scope, lease)) {
        return reject(observability, {
          status: 403,
          code: API_ERROR_CODES.forbidden,
          message: "Du saknar behörighet till dokumentet",
          event: "resident_documents.download.scope_forbidden",
          context: { userId: user.id, companyId: user.company_id, leaseId: lease.id },
        });
      }

      documentId = documentLog.id;
      contentType = typeof metadata.contentType === "string" ? metadata.contentType : "";
      fileName = typeof metadata.fileName === "string"
        ? metadata.fileName
        : typeof metadata.name === "string"
          ? metadata.name
          : "dokument";
      expectedSize = typeof metadata.sizeBytes === "number" ? metadata.sizeBytes : null;

      const storageUrl = typeof metadata.storageUrl === "string" ? metadata.storageUrl : null;
      const dataUrl = typeof metadata.dataUrl === "string" ? metadata.dataUrl : null;
      if (storageUrl) {
        try {
          bytes = await bytesFromStorage(storageUrl);
        } catch (error) {
          if (error instanceof Error && error.message === "storage_unconfigured") {
            return reject(observability, {
              status: 503,
              code: API_ERROR_CODES.serviceUnavailable,
              message: "Fillagringen är inte konfigurerad",
              event: "resident_documents.download.storage_unavailable",
              context: { userId: user.id, companyId: user.company_id, leaseId: lease.id, documentId },
            });
          }
          throw error;
        }
      } else if (dataUrl) {
        bytes = bytesFromDataUrl(dataUrl, contentType);
      }
    }

    if (!allowedDocumentContentTypes.has(contentType)) {
      return reject(observability, {
        status: 415,
        code: API_ERROR_CODES.validationFailed,
        message: "Dokumentets filformat stöds inte",
        event: "resident_documents.download.unsupported_type",
        context: { userId: user.id, companyId: user.company_id, leaseId: lease.id, documentId },
      });
    }
    if (!bytes?.length) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Dokumentfilen saknas",
        event: "resident_documents.download.file_missing",
        context: { userId: user.id, companyId: user.company_id, leaseId: lease.id, documentId },
      });
    }
    if (expectedSize !== null && bytes.length !== expectedSize) {
      return reject(observability, {
        status: 422,
        code: API_ERROR_CODES.validationFailed,
        message: "Dokumentfilens storlek kunde inte verifieras",
        event: "resident_documents.download.size_mismatch",
        context: { userId: user.id, companyId: user.company_id, leaseId: lease.id, documentId },
      });
    }

    const safeName = safeDocumentFileName(fileName);
    const validation = validateDocumentFile({
      bytes,
      contentType,
      fileName: safeName,
      maxBytes: 2_000_000,
    });
    if (!validation.ok) {
      return reject(observability, {
        status: 422,
        code: API_ERROR_CODES.validationFailed,
        message: "Dokumentfilens innehåll kunde inte verifieras",
        event: "resident_documents.download.content_invalid",
        context: { userId: user.id, companyId: user.company_id, leaseId: lease.id, documentId },
      });
    }

    await db.auditLog.create({
      data: {
        company_id: user.company_id,
        actor_user_id: user.id,
        entity_type: "document",
        entity_id: documentId,
        action: "resident_portal.document_downloaded",
        metadata: {
          documentId,
          leaseId: lease.id,
          leaseNumber: lease.lease_number,
          visibility,
          fileName: validation.fileName,
          contentType,
          sizeBytes: bytes.length,
          accessMode: residentView ? "resident_self_service" : "operations_preview",
        },
      },
    });

    observability.logger.info("resident document download completed", observability.elapsed({
      event: "resident_documents.download.completed",
      userId: user.id,
      companyId: user.company_id,
      documentId,
      leaseId: lease.id,
      residentView,
      sizeBytes: bytes.length,
    }));

    const response = new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(validation.fileName)}`,
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
    return observability.correlate(response);
  } catch (error) {
    observability.logger.error("resident document download failed", error, observability.elapsed({
      event: "resident_documents.download.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
