import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { canManageTickets, canViewOperations, getCurrentUser, type CompanyUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { validateUploadFile } from "@/lib/document-file-security";
import { sqlSoftDeleteGuard } from "@/lib/soft-delete-compat";
import { StorageConfigurationError, storeAttachment } from "@/lib/storage";
import { findAccessibleWorkOrder } from "@/lib/assigned-work-access";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/operational-documents";
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ENTITY_TYPES = new Set(["work_order", "project", "property", "technical_asset"]);
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

async function resolveEntity(user: CompanyUser, entityType: string, entityId: string) {
  const companyId = user.company_id;
  if (entityType === "work_order") return findAccessibleWorkOrder(user, entityId);
  if (entityType === "project") {
    if (!canViewOperations(user.role)) return null;
    return db.project.findFirst({ where: { deleted_at: null, id: entityId, company_id: companyId, property: { deleted_at: null } }, select: { id: true } });
  }
  if (entityType === "property") return db.property.findFirst({ where: { id: entityId, company_id: companyId, deleted_at: null }, select: { id: true } });
  if (entityType === "technical_asset") {
    const propertyGuard = await sqlSoftDeleteGuard(db, "Property", "p");
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT a."id"
      FROM "PropertyTechnicalAsset" a
      INNER JOIN "Property" p ON p."id" = a."property_id" AND p."company_id" = a."company_id"
      WHERE a."id" = ${entityId}
        AND a."company_id" = ${companyId}
        ${propertyGuard}
      LIMIT 1
    `);
    return rows[0] || null;
  }
  return null;
}

function toClientDocument(document: Record<string, unknown>, entityType: string, entityId: string) {
  const id = String(document.id);
  return {
    ...document,
    storage_url: entityType === "work_order"
      ? `/api/work-orders/${entityId}/documents/${id}`
      : `/api/operational-documents/${id}/download`,
  };
}

function successResponse(
  observability: ReturnType<typeof createRouteObservability>,
  body: unknown,
  init?: ResponseInit,
) {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(SUCCESS_HEADERS)) headers.set(name, value);
  return observability.correlate(NextResponse.json(body, { ...init, headers }));
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
  observability.logger.warn("operational document request rejected", observability.elapsed({
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

export async function GET(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "operational_documents.list.unauthorized",
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        event: "operational_documents.list.missing_company",
        context: { userId: user.id },
      });
    }

    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType") || "";
    const entityId = url.searchParams.get("entityId") || "";
    if (!entityId || !ENTITY_TYPES.has(entityType)) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ogiltig dokumentkoppling",
        event: "operational_documents.list.validation_failed",
        context: { reason: "invalid_entity_link", userId: user.id, companyId: user.company_id },
      });
    }

    const entity = await resolveEntity(user as CompanyUser, entityType, entityId);
    if (!entity) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Objektet hittades inte",
        event: "operational_documents.list.entity_not_found",
        context: { userId: user.id, companyId: user.company_id, entityType },
      });
    }

    let documents: Record<string, unknown>[];
    if (entityType === "property" || entityType === "technical_asset") {
      const documentGuard = await sqlSoftDeleteGuard(db, "OperationalDocument", "d");
      documents = await db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        SELECT d."id", d."file_name", d."storage_key" AS "storage_url", d."content_type",
               d."size_bytes", d."category", d."visibility", d."version", d."created_at",
               json_build_object('id', u."id", 'name', u."name", 'email', u."email") AS "uploaded_by"
        FROM "OperationalDocument" d
        JOIN "User" u ON u."id" = d."uploaded_by_id"
        WHERE d."company_id" = ${user.company_id}
          ${documentGuard}
          AND ${entityType === "property" ? Prisma.sql`d."property_id" = ${entityId}` : Prisma.sql`d."technical_asset_id" = ${entityId}`}
        ORDER BY d."created_at" DESC
        LIMIT 100
      `);
    } else {
      documents = await db.operationalDocument.findMany({
        where: {
          company_id: user.company_id,
          deleted_at: null,
          ...(entityType === "work_order" ? { work_order_id: entityId } : { project_id: entityId }),
        },
        orderBy: { created_at: "desc" },
        include: { uploaded_by: { select: { id: true, name: true, email: true } } },
        take: 100,
      }) as unknown as Record<string, unknown>[];
    }

    observability.logger.info("operational document list completed", observability.elapsed({
      event: "operational_documents.list.completed",
      userId: user.id,
      companyId: user.company_id,
      entityType,
      entityId,
      returned: documents.length,
    }));
    return successResponse(observability, {
      documents: documents.map((document) => toClientDocument(document, entityType, entityId)),
    });
  } catch (error) {
    observability.logger.error("operational document list failed", error, observability.elapsed({
      event: "operational_documents.list.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "operational_documents.create.unauthorized",
      });
    }
    if (!canManageTickets(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet",
        event: "operational_documents.create.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        event: "operational_documents.create.missing_company",
        context: { userId: user.id },
      });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const entityType = String(formData.get("entityType") || "");
    const entityId = String(formData.get("entityId") || "");
    const category = String(formData.get("category") || "other").trim().slice(0, 50);
    const visibility = String(formData.get("visibility") || "internal");
    const validationFailure = (message: string, reason: string) => reject(observability, {
      status: 400,
      code: API_ERROR_CODES.validationFailed,
      message,
      event: "operational_documents.create.validation_failed",
      context: { reason, userId: user.id, companyId: user.company_id },
    });

    if (!(file instanceof File)) return validationFailure("Välj en fil att ladda upp", "missing_file");
    if (!entityId || !ENTITY_TYPES.has(entityType)) return validationFailure("Ogiltig dokumentkoppling", "invalid_entity_link");
    if (!new Set(["internal", "shared"]).has(visibility)) return validationFailure("Ogiltig synlighet", "invalid_visibility");

    const bytes = Buffer.from(await file.arrayBuffer());
    const validation = validateUploadFile({
      bytes,
      contentType: file.type,
      fileName: file.name,
      profile: "operational_document",
      maxBytes: MAX_FILE_SIZE,
    });
    if (!validation.ok) return validationFailure(validation.error, "invalid_file");

    const entity = await resolveEntity(user as CompanyUser, entityType, entityId);
    if (!entity) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Objektet hittades inte",
        event: "operational_documents.create.entity_not_found",
        context: { userId: user.id, companyId: user.company_id, entityType },
      });
    }

    const stored = await storeAttachment({
      fileName: validation.fileName,
      contentType: validation.contentType,
      buffer: bytes,
      prefix: `companies/${user.company_id}/${entityType}/${entityId}`,
    });

    let document: Record<string, unknown>;
    if (entityType === "property" || entityType === "technical_asset") {
      const documentId = crypto.randomUUID();
      const rows = await db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        INSERT INTO "OperationalDocument"
          ("id", "company_id", "property_id", "technical_asset_id", "uploaded_by_id", "file_name", "storage_key",
           "content_type", "size_bytes", "category", "visibility", "version")
        VALUES
          (${documentId}, ${user.company_id}, ${entityType === "property" ? entityId : null}, ${entityType === "technical_asset" ? entityId : null},
           ${user.id}, ${validation.fileName.slice(0, 255)}, ${stored.url}, ${validation.contentType}, ${validation.sizeBytes}, ${category}, ${visibility}, 1)
        RETURNING "id", "file_name", "storage_key" AS "storage_url", "content_type", "size_bytes", "category", "visibility", "version", "created_at"
      `);
      document = { ...rows[0], uploaded_by: { id: user.id, name: user.name, email: user.email } };
    } else {
      document = await db.operationalDocument.create({
        data: {
          company_id: user.company_id,
          work_order_id: entityType === "work_order" ? entityId : null,
          project_id: entityType === "project" ? entityId : null,
          uploaded_by_id: user.id,
          file_name: validation.fileName.slice(0, 255),
          storage_url: stored.url,
          content_type: validation.contentType,
          size_bytes: validation.sizeBytes,
          category,
          visibility,
          version: 1,
        },
        include: { uploaded_by: { select: { id: true, name: true, email: true } } },
      }) as unknown as Record<string, unknown>;
    }

    await writeAuditLog(user, {
      entityType,
      entityId,
      action: "document.uploaded",
      metadata: {
        documentId: document.id,
        fileName: document.file_name,
        contentType: document.content_type,
        sizeBytes: document.size_bytes,
        category,
        visibility,
      },
    });

    observability.logger.info("operational document create completed", observability.elapsed({
      event: "operational_documents.create.completed",
      userId: user.id,
      companyId: user.company_id,
      entityType,
      entityId,
      documentId: String(document.id),
    }));
    return successResponse(observability, { document: toClientDocument(document, entityType, entityId) }, { status: 201 });
  } catch (error) {
    if (error instanceof StorageConfigurationError) {
      observability.logger.error("operational document storage unavailable", error, observability.elapsed({
        event: "operational_documents.create.storage_unavailable",
      }));
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: "Fillagringen är inte konfigurerad",
        requestId: observability.requestId,
      });
    }
    observability.logger.error("operational document create failed", error, observability.elapsed({
      event: "operational_documents.create.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
