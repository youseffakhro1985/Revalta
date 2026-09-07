import { del, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse, type ApiErrorCode } from "@/lib/api-error-response";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser, isStaffRole, type CompanyUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { validateUploadFile } from "@/lib/document-file-security";
import { getStorageToken } from "@/lib/storage";
import { findAccessibleWorkOrder } from "@/lib/assigned-work-access";
import { createRouteObservability } from "@/lib/route-observability";

export const dynamic = "force-dynamic";
const ROUTE = "/api/work-orders/[id]/documents";
const categories = new Set(["before", "after", "invoice", "warranty", "manual", "report", "other"]);
const visibilities = new Set(["internal", "shared"]);
const MAX_SIZE = 15 * 1024 * 1024;
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const documentSelect = {
  id: true, file_name: true, content_type: true, size_bytes: true,
  category: true, visibility: true, version: true, created_at: true,
  uploaded_by: { select: { id: true, name: true, email: true } },
} as const;
type Observability = ReturnType<typeof createRouteObservability>;
type Params = { params: Promise<{ id: string }> };

function reject(observability: Observability, status: number, code: ApiErrorCode, message: string) {
  return apiErrorResponse({ status, code, message, requestId: observability.requestId });
}

function success(observability: Observability, body: unknown, status = 200) {
  return observability.correlate(NextResponse.json(body, { status, headers: SUCCESS_HEADERS }));
}

function failure(observability: Observability, operation: string) {
  // Provider/Prisma errors can contain file names, URLs or credentials. Record
  // only a stable event and correlation id for this boundary.
  observability.logger.error("work-order document operation failed", undefined, observability.elapsed({
    event: `work_order.documents.${operation}_failed`,
  }));
  return reject(observability, 500, API_ERROR_CODES.internalError, "Dokumentåtgärden kunde inte slutföras. Försök igen.");
}

async function context(id: string, observability: Observability) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reject(observability, 401, API_ERROR_CODES.unauthorized, "Obehörig") } as const;
  if (!isStaffRole(user.role)) return { ok: false, error: reject(observability, 403, API_ERROR_CODES.forbidden, "Du saknar behörighet") } as const;
  if (!user.company_id) return { ok: false, error: reject(observability, 400, API_ERROR_CODES.validationFailed, "Användaren saknar organisation") } as const;
  const workOrder = await findAccessibleWorkOrder(user as CompanyUser, id);
  if (!workOrder) return { ok: false, error: reject(observability, 404, API_ERROR_CODES.notFound, "Arbetsordern hittades inte") } as const;
  return { ok: true, user: user as CompanyUser, workOrder } as const;
}

export async function GET(request: Request, { params }: Params) {
  const observability = createRouteObservability(request, ROUTE);
  try {
    const { id } = await params;
    const ctx = await context(id, observability);
    if (!ctx.ok) return ctx.error;
    const storedDocuments = await db.operationalDocument.findMany({
      where: { company_id: ctx.user.company_id, work_order_id: id, deleted_at: null },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: documentSelect,
    });
    const documents = storedDocuments.map((document) => ({
      ...document,
      storage_url: `/api/work-orders/${id}/documents/${document.id}`,
    }));
    return success(observability, { documents, canManage: canManageTickets(ctx.user.role) });
  } catch {
    return failure(observability, "list");
  }
}

export async function POST(request: Request, { params }: Params) {
  const observability = createRouteObservability(request, ROUTE);
  try {
    const { id } = await params;
    const ctx = await context(id, observability);
    if (!ctx.ok) return ctx.error;
    if (!canManageTickets(ctx.user.role)) return reject(observability, 403, API_ERROR_CODES.forbidden, "Du saknar behörighet");
    const token = getStorageToken();
    if (!token) return reject(observability, 503, API_ERROR_CODES.serviceUnavailable, "Fillagringen är inte konfigurerad");

    const form = await request.formData().catch(() => null);
    if (!form) return reject(observability, 400, API_ERROR_CODES.validationFailed, "Ogiltig filuppladdning");
    const file = form.get("file");
    const category = String(form.get("category") || "other");
    const visibility = String(form.get("visibility") || "internal");
    if (!(file instanceof File)) return reject(observability, 400, API_ERROR_CODES.validationFailed, "Välj en fil");
    if (!categories.has(category) || !visibilities.has(visibility)) return reject(observability, 400, API_ERROR_CODES.validationFailed, "Ogiltig dokumentkategori eller synlighet");
    if (file.size > MAX_SIZE) return reject(observability, 413, API_ERROR_CODES.payloadTooLarge, "Filen får vara högst 15 MB");

    const bytes = Buffer.from(await file.arrayBuffer());
    const validation = validateUploadFile({
      bytes,
      contentType: file.type,
      fileName: file.name,
      profile: "work_order_document",
      maxBytes: MAX_SIZE,
    });
    if (!validation.ok) return reject(observability, 400, API_ERROR_CODES.validationFailed, validation.error);

    const safeName = validation.fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
    const blob = await put(`work-orders/${ctx.user.company_id}/${id}/${crypto.randomUUID()}-${safeName}`, bytes, {
      access: "private",
      addRandomSuffix: false,
      contentType: validation.contentType,
      token,
    });
    let document;
    try {
      // Audit failure must roll back the record before compensating the upload.
      // Otherwise compensation deletes a file still referenced by committed data.
      document = await db.$transaction(async (tx) => {
        const created = await tx.operationalDocument.create({
          data: {
            company_id: ctx.user.company_id,
            work_order_id: id,
            uploaded_by_id: ctx.user.id,
            file_name: validation.fileName.slice(0, 255),
            storage_url: blob.url,
            content_type: validation.contentType,
            size_bytes: validation.sizeBytes,
            category,
            visibility,
          },
          select: documentSelect,
        });
        await writeAuditLog(ctx.user, {
          entityType: "work_order", entityId: id, action: "work_order.document_uploaded",
          metadata: { documentId: created.id, fileName: created.file_name, category, visibility, sizeBytes: created.size_bytes },
        }, tx);
        return created;
      });
    } catch {
      try {
        await del(blob.url, { token });
      } catch {
        observability.logger.error("work-order document upload cleanup failed", undefined, observability.elapsed({
          event: "work_order.documents.upload_cleanup_failed",
        }));
      }
      return failure(observability, "upload");
    }
    return success(observability, {
      document: { ...document, storage_url: `/api/work-orders/${id}/documents/${document.id}` },
    }, 201);
  } catch {
    return failure(observability, "upload");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const observability = createRouteObservability(request, ROUTE);
  try {
    const { id } = await params;
    const ctx = await context(id, observability);
    if (!ctx.ok) return ctx.error;
    if (!canManageTickets(ctx.user.role)) return reject(observability, 403, API_ERROR_CODES.forbidden, "Du saknar behörighet");
    const documentId = new URL(request.url).searchParams.get("documentId");
    if (!documentId) return reject(observability, 400, API_ERROR_CODES.validationFailed, "Dokument-ID saknas");

    const deleted = await db.$transaction(async (tx) => {
      const where = { id: documentId, company_id: ctx.user.company_id, work_order_id: id, deleted_at: null };
      const document = await tx.operationalDocument.findFirst({
        where,
        select: { id: true, file_name: true, category: true },
      });
      if (!document) return false;
      const deleteResult = await tx.operationalDocument.updateMany({ where, data: { deleted_at: new Date() } });
      if (deleteResult.count === 0) return false;
      await writeAuditLog(ctx.user, {
        entityType: "work_order", entityId: id, action: "work_order.document_deleted",
        metadata: { documentId: document.id, fileName: document.file_name, category: document.category, softDelete: true },
      }, tx);
      return true;
    });
    if (!deleted) return reject(observability, 404, API_ERROR_CODES.notFound, "Dokumentet hittades inte");
    return success(observability, { success: true });
  } catch {
    return failure(observability, "delete");
  }
}
