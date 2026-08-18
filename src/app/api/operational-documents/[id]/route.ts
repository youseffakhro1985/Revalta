import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser, type CompanyUser } from "@/lib/current-user";
import { isOperationalDocumentAccessible } from "@/lib/operational-document-access";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/operational-documents/[id]";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

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
  observability.logger.warn("operational document delete rejected", observability.elapsed({
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

export async function DELETE(
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
        event: "operational_documents.delete.unauthorized",
      });
    }
    if (!canManageTickets(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet",
        event: "operational_documents.delete.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        event: "operational_documents.delete.missing_company",
        context: { userId: user.id },
      });
    }

    const { id } = await params;
    const document = await db.operationalDocument.findFirst({
      where: { id, company_id: user.company_id, deleted_at: null },
      select: {
        id: true,
        file_name: true,
        category: true,
        work_order_id: true,
        project_id: true,
        property_id: true,
        technical_asset_id: true,
      },
    });
    if (!document) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Dokumentet hittades inte",
        event: "operational_documents.delete.not_found",
        context: { userId: user.id, companyId: user.company_id },
      });
    }
    if (!(await isOperationalDocumentAccessible(user as CompanyUser, document))) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Dokumentet hittades inte",
        event: "operational_documents.delete.inaccessible",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const deleteResult = await db.operationalDocument.updateMany({
      where: { id: document.id, company_id: user.company_id, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    if (deleteResult.count === 0) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Dokumentet hittades inte",
        event: "operational_documents.delete.not_found_after_write",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const entityType = document.work_order_id
      ? "work_order"
      : document.project_id
        ? "project"
        : document.property_id
          ? "property"
          : "technical_asset";
    const entityId = document.work_order_id
      || document.project_id
      || document.property_id
      || document.technical_asset_id
      || document.id;

    await writeAuditLog(user, {
      entityType,
      entityId,
      action: "document.deleted",
      metadata: {
        documentId: document.id,
        fileName: document.file_name,
        category: document.category,
        softDelete: true,
        storage: "OperationalDocument",
      },
    });

    observability.logger.info("operational document delete completed", observability.elapsed({
      event: "operational_documents.delete.completed",
      userId: user.id,
      companyId: user.company_id,
      documentId: document.id,
      entityType,
    }));
    return observability.correlate(NextResponse.json({ success: true }, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("operational document delete failed", error, observability.elapsed({
      event: "operational_documents.delete.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
