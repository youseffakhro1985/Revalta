import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { writeAuditLog } from "@/lib/audit";
import { canAssignWorkOrders, getCurrentUser } from "@/lib/current-user";
import db from "@/lib/db";
import { runPreventiveMaintenanceEngine } from "@/lib/preventive-maintenance-engine";
import { isCronRequestAuthorized } from "@/lib/request-security";
import { createRouteObservability } from "@/lib/route-observability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/cron/preventive-maintenance";
const JOB = "preventive_maintenance";
const JOB_TYPE = "preventive_maintenance_run";
const SAFE_RUN_ERROR = "Körningen misslyckades";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

type MaintenanceResult = Awaited<ReturnType<typeof runPreventiveMaintenanceEngine>>;

function safeSummary(result: MaintenanceResult) {
  return {
    examined: result.examined,
    created: result.created,
    skipped: result.skipped,
    failed: result.failed,
  };
}

function persistedResult(result: MaintenanceResult) {
  return {
    ...safeSummary(result),
    workOrderIds: result.workOrderIds,
  };
}

async function execute(companyId?: string) {
  const run = await db.cronJobRun.create({
    data: {
      company_id: companyId ?? null,
      job_type: JOB_TYPE,
      status: "processing",
      recipient: companyId ? `company:${companyId}` : "all-companies",
      payload: { companyId: companyId ?? null, startedAt: new Date().toISOString() },
    },
  });

  try {
    const result = await runPreventiveMaintenanceEngine({ companyId });
    await db.cronJobRun.update({
      where: { id: run.id },
      data: {
        status: result.failed > 0 ? "partial" : "sent",
        payload: {
          ...persistedResult(result),
          companyId: companyId ?? null,
          completedAt: new Date().toISOString(),
        },
      },
    });
    return result;
  } catch (error) {
    await db.cronJobRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        payload: {
          companyId: companyId ?? null,
          error: SAFE_RUN_ERROR,
          completedAt: new Date().toISOString(),
        },
      },
    });
    throw error;
  }
}

function successResponse(
  observability: ReturnType<typeof createRouteObservability>,
  body: unknown,
) {
  return observability.correlate(NextResponse.json(body, { headers: SUCCESS_HEADERS }));
}

export async function GET(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  if (!isCronRequestAuthorized(request)) {
    observability.logger.warn("preventive maintenance cron rejected", observability.elapsed({
      event: "cron.authorization.denied",
      job: JOB,
    }));
    return apiErrorResponse({
      status: 401,
      code: API_ERROR_CODES.unauthorized,
      message: "Obehörig",
      requestId: observability.requestId,
    });
  }

  observability.logger.info("preventive maintenance cron started", observability.elapsed({
    event: "cron.started",
    job: JOB,
  }));

  try {
    const result = await execute();
    const summary = safeSummary(result);
    if (result.failed > 0) {
      observability.logger.warn("preventive maintenance cron partially failed", observability.elapsed({
        event: "cron.partial_failure",
        job: JOB,
        ...summary,
      }));
    } else {
      observability.logger.info("preventive maintenance cron completed", observability.elapsed({
        event: "cron.completed",
        job: JOB,
        ...summary,
      }));
    }
    return successResponse(observability, result);
  } catch (error) {
    observability.logger.error("preventive maintenance cron failed", error, observability.elapsed({
      event: "cron.failed",
      job: JOB,
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Cron-körningen misslyckades",
      requestId: observability.requestId,
    });
  }
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      observability.logger.warn("manual preventive maintenance rejected", observability.elapsed({
        event: "cron.manual_unauthorized",
        job: JOB,
      }));
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        requestId: observability.requestId,
      });
    }
    if (!user.company_id) {
      observability.logger.warn("manual preventive maintenance missing company", observability.elapsed({
        event: "cron.manual_missing_company",
        job: JOB,
        userId: user.id,
      }));
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Användaren saknar organisation",
        requestId: observability.requestId,
      });
    }
    const companyId = user.company_id;
    if (!canAssignWorkOrders(user.role)) {
      observability.logger.warn("manual preventive maintenance forbidden", observability.elapsed({
        event: "cron.manual_forbidden",
        job: JOB,
        userId: user.id,
        companyId,
      }));
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet",
        requestId: observability.requestId,
      });
    }

    observability.logger.info("manual preventive maintenance started", observability.elapsed({
      event: "cron.manual_started",
      job: JOB,
      userId: user.id,
      companyId,
    }));
    const result = await execute(companyId);
    const summary = safeSummary(result);

    try {
      await writeAuditLog(user, {
        entityType: "preventive_maintenance",
        entityId: companyId,
        action: "preventive_maintenance.manual_run",
        metadata: { schemaVersion: 2, ...summary, storage: "CronJobRun" },
      });
    } catch {
      observability.logger.warn("manual preventive maintenance audit failed", observability.elapsed({
        event: "cron.manual_audit_failed",
        job: JOB,
        userId: user.id,
        companyId,
      }));
    }

    if (result.failed > 0) {
      observability.logger.warn("manual preventive maintenance partially failed", observability.elapsed({
        event: "cron.manual_partial_failure",
        job: JOB,
        userId: user.id,
        companyId,
        ...summary,
      }));
    } else {
      observability.logger.info("manual preventive maintenance completed", observability.elapsed({
        event: "cron.manual_completed",
        job: JOB,
        userId: user.id,
        companyId,
        ...summary,
      }));
    }
    return successResponse(observability, result);
  } catch (error) {
    observability.logger.error("manual preventive maintenance failed", error, observability.elapsed({
      event: "cron.manual_failed",
      job: JOB,
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
