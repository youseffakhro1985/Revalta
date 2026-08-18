import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { writeAuditLog } from "@/lib/audit";
import { canAssignWorkOrders, getCurrentUser } from "@/lib/current-user";
import { isCronRequestAuthorized } from "@/lib/request-security";
import { createRouteObservability } from "@/lib/route-observability";
import {
  createRecurringRun,
  runRecurringWorkOrderEngine,
  updateRecurringRun,
} from "@/lib/recurring-work-order-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const SAFE_RUN_ERROR = "Körningen misslyckades";

async function execute(companyId?: string) {
  const run = await createRecurringRun({
    companyId: companyId ?? null,
    status: "processing",
    recipient: companyId ? `company:${companyId}` : "all-companies",
    payload: { companyId: companyId ?? null, startedAt: new Date().toISOString() },
  });

  try {
    const result = await runRecurringWorkOrderEngine({ companyId });
    await updateRecurringRun(run.id, {
      status: result.failed > 0 ? "partial" : "sent",
      payload: { ...result, companyId: companyId ?? null, completedAt: new Date().toISOString() },
    });
    return result;
  } catch (error) {
    await updateRecurringRun(run.id, {
      status: "failed",
      payload: {
        companyId: companyId ?? null,
        error: SAFE_RUN_ERROR,
        completedAt: new Date().toISOString(),
      },
    });
    throw error;
  }
}

function successResponse(observability: ReturnType<typeof createRouteObservability>, body: unknown) {
  return observability.correlate(NextResponse.json(body, { headers: SUCCESS_HEADERS }));
}

export async function GET(request: Request) {
  const observability = createRouteObservability(request, "/api/cron/recurring-work-orders");

  if (!isCronRequestAuthorized(request)) {
    observability.logger.warn("recurring work-order cron rejected", observability.elapsed({
      event: "cron.recurring_work_orders.unauthorized",
    }));
    return apiErrorResponse({
      status: 401,
      code: API_ERROR_CODES.unauthorized,
      message: "Obehörig",
      requestId: observability.requestId,
    });
  }

  try {
    const result = await execute();
    observability.logger.info("recurring work-order cron completed", observability.elapsed({
      event: "cron.recurring_work_orders.completed",
      generated: result.generated,
      skipped: result.skipped,
      failed: result.failed,
    }));
    return successResponse(observability, result);
  } catch (error) {
    observability.logger.error("recurring work-order cron failed", error, observability.elapsed({
      event: "cron.recurring_work_orders.failed",
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
  const observability = createRouteObservability(request, "/api/cron/recurring-work-orders");

  try {
    const user = await getCurrentUser();
    if (!user) {
      observability.logger.warn("manual recurring work-order run rejected", observability.elapsed({
        event: "cron.recurring_work_orders.manual_unauthorized",
      }));
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        requestId: observability.requestId,
      });
    }
    if (!user.company_id) {
      observability.logger.warn("manual recurring work-order run missing company", observability.elapsed({
        event: "cron.recurring_work_orders.manual_missing_company",
        userId: user.id,
      }));
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        requestId: observability.requestId,
      });
    }
    if (!canAssignWorkOrders(user.role)) {
      observability.logger.warn("manual recurring work-order run forbidden", observability.elapsed({
        event: "cron.recurring_work_orders.manual_forbidden",
        userId: user.id,
        companyId: user.company_id,
      }));
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet",
        requestId: observability.requestId,
      });
    }

    const result = await execute(user.company_id);
    await writeAuditLog(user, {
      entityType: "recurring_work_order",
      entityId: user.company_id,
      action: "recurring_work_orders.manual_run",
      metadata: result,
    });
    observability.logger.info("manual recurring work-order run completed", observability.elapsed({
      event: "cron.recurring_work_orders.manual_completed",
      userId: user.id,
      companyId: user.company_id,
      generated: result.generated,
      skipped: result.skipped,
      failed: result.failed,
    }));
    return successResponse(observability, result);
  } catch (error) {
    observability.logger.error("manual recurring work-order run failed", error, observability.elapsed({
      event: "cron.recurring_work_orders.manual_failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
