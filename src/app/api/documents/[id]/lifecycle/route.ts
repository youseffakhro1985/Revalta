import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/documents/[id]/lifecycle";
const allowedTransitions = new Set(["archive", "unpublish", "restore"]);
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function successResponse(
  observability: ReturnType<typeof createRouteObservability>,
  body: unknown,
) {
  return observability.correlate(NextResponse.json(body, { headers: SUCCESS_HEADERS }));
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
  observability.logger.warn("document lifecycle request rejected", observability.elapsed({
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

export async function PATCH(
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
        event: "documents.lifecycle.unauthorized",
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        event: "documents.lifecycle.missing_company",
        context: { userId: user.id },
      });
    }
    const companyId = user.company_id;
    if (!["owner", "admin", "manager"].includes(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att ändra dokument",
        event: "documents.lifecycle.forbidden",
        context: { userId: user.id, companyId },
      });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { transition?: unknown; reason?: unknown } | null;
    const transition = typeof body?.transition === "string" ? body.transition.trim() : "";
    const reasonProvided = typeof body?.reason === "string" && body.reason.trim().length > 0;
    if (!allowedTransitions.has(transition)) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ogiltig dokumentåtgärd",
        event: "documents.lifecycle.validation_failed",
        context: { reason: "invalid_transition", userId: user.id, companyId },
      });
    }

    const modern = await db.managedDocument.findFirst({
      where: {
        id,
        company_id: companyId,
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
      select: { id: true, visibility: true, lifecycle_state: true },
    });
    if (!modern) {
      const orphaned = await db.managedDocument.findFirst({
        where: { id, company_id: companyId },
        select: { id: true },
      });
      if (orphaned) {
        return reject(observability, {
          status: 404,
          code: API_ERROR_CODES.notFound,
          message: "Dokumentet hittades inte",
          event: "documents.lifecycle.orphaned",
          context: { userId: user.id, companyId },
        });
      }
    }

    const nextState = transition === "archive" ? "archived" : transition === "unpublish" ? "unpublished" : "active";
    const action = transition === "archive"
      ? "document.archived"
      : transition === "unpublish"
        ? "document.unpublished"
        : "document.restored";

    if (modern) {
      if (modern.lifecycle_state === nextState) {
        observability.logger.info("document lifecycle unchanged", observability.elapsed({
          event: "documents.lifecycle.unchanged",
          userId: user.id,
          companyId,
          documentId: modern.id,
        }));
        return successResponse(observability, { success: true, state: modern.lifecycle_state, unchanged: true });
      }
      if (transition === "unpublish" && modern.lifecycle_state === "archived") {
        return reject(observability, {
          status: 409,
          code: API_ERROR_CODES.conflict,
          message: "Återställ det arkiverade dokumentet innan det avpubliceras",
          event: "documents.lifecycle.transition_conflict",
          context: { userId: user.id, companyId, documentId: modern.id },
        });
      }

      const updateResult = await db.$transaction(async (tx) => {
        const result = await tx.managedDocument.updateMany({
          where: { id: modern.id, company_id: companyId },
          data: { lifecycle_state: nextState },
        });
        if (result.count === 0) return result;

        await writeAuditLog(user, {
          entityType: "document",
          entityId: modern.id,
          action,
          metadata: {
            schemaVersion: 6,
            storage: "ManagedDocument",
            previousState: modern.lifecycle_state,
            nextState,
            previousVisibility: modern.visibility,
            reasonProvided,
          },
        }, tx);

        return result;
      });
      if (updateResult.count === 0) {
        return reject(observability, {
          status: 404,
          code: API_ERROR_CODES.notFound,
          message: "Dokumentet hittades inte",
          event: "documents.lifecycle.not_found_after_write",
          context: { userId: user.id, companyId },
        });
      }

      observability.logger.info("document lifecycle completed", observability.elapsed({
        event: "documents.lifecycle.completed",
        userId: user.id,
        companyId,
        documentId: modern.id,
        transition,
      }));
      return successResponse(observability, { success: true, state: nextState });
    }

    const legacy = await db.auditLog.findFirst({
      where: {
        id,
        company_id: companyId,
        entity_type: "document",
        action: "document.created",
      },
      select: { id: true },
    });
    if (legacy) {
      return reject(observability, {
        status: 409,
        code: API_ERROR_CODES.conflict,
        message: "Dokumentet finns kvar i äldre lagring. Kör backfill till ManagedDocument innan livscykel ändras.",
        event: "documents.lifecycle.legacy_conflict",
        context: { userId: user.id, companyId },
      });
    }

    return reject(observability, {
      status: 404,
      code: API_ERROR_CODES.notFound,
      message: "Dokumentet hittades inte",
      event: "documents.lifecycle.not_found",
      context: { userId: user.id, companyId },
    });
  } catch (error) {
    observability.logger.error("document lifecycle failed", error, observability.elapsed({
      event: "documents.lifecycle.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
