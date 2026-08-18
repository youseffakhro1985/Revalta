import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canCreateProperties, getCurrentUser } from "@/lib/current-user";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/properties/[id]/restore";
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
  observability.logger.warn("property restore request rejected", observability.elapsed({
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

export async function POST(
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
        event: "properties.restore.unauthorized",
      });
    }
    if (!canCreateProperties(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att återställa fastigheter",
        event: "properties.restore.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        event: "properties.restore.missing_company",
        context: { userId: user.id },
      });
    }

    const { id } = await params;
    const existing = await db.property.findFirst({
      where: { id, company_id: user.company_id, deleted_at: { not: null } },
      select: { id: true, name: true, status: true },
    });
    if (!existing) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Fastigheten hittades inte eller är redan aktiv",
        event: "properties.restore.not_found",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    // Restore + audit log remain atomic. A failed audit write must roll the
    // restore back so the caller never receives a false-negative response.
    const restored = await db.$transaction(async (tx) => {
      const restoreResult = await tx.property.updateMany({
        where: { id: existing.id, company_id: user.company_id, deleted_at: { not: null } },
        data: { deleted_at: null },
      });
      if (restoreResult.count === 0) return false;

      await writeAuditLog(user, {
        entityType: "property",
        entityId: existing.id,
        action: "property.restored",
        metadata: { name: existing.name, previousStatus: existing.status, softDelete: true },
      }, tx);
      return true;
    });
    if (!restored) {
      return reject(observability, {
        status: 404,
        code: API_ERROR_CODES.notFound,
        message: "Fastigheten hittades inte eller är redan aktiv",
        event: "properties.restore.not_found_after_write",
        context: { userId: user.id, companyId: user.company_id, propertyId: existing.id },
      });
    }

    observability.logger.info("property restore completed", observability.elapsed({
      event: "properties.restore.completed",
      userId: user.id,
      companyId: user.company_id,
      propertyId: existing.id,
    }));
    return observability.correlate(NextResponse.json({ success: true, id: existing.id }, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("property restore failed", error, observability.elapsed({
      event: "properties.restore.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
