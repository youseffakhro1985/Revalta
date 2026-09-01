import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canAssignWorkOrders, getCurrentUser } from "@/lib/current-user";
import { isCronRequestAuthorized } from "@/lib/request-security";
import { createRouteObservability } from "@/lib/route-observability";
import { runPreventiveMaintenanceEngine } from "@/lib/preventive-maintenance-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB_TYPE = "preventive_maintenance_run";
const SAFE_RUN_ERROR = "Körningen misslyckades";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

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
        payload: { ...result, companyId: companyId ?? null, completedAt: new Date().toISOString() },
      },
    });
    return result;
  } catch (error) {
    await db.cronJobRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        payload: { companyId: companyId ?? null, error: SAFE_RUN_ERROR, completedAt: new Date().toISOString() },
      },
    });
    throw error;
  }
}

export async function GET(request: Request) {
  const observability = createRouteObservability(request, "/api/cron/preventive-maintenance");
  if (!isCronRequestAuthorized(request)) {
    observability.logger.warn("preventive maintenance cron rejected", observability.elapsed({ event: "cron.preventive_maintenance.unauthorized" }));
    return apiErrorResponse({ status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", requestId: observability.requestId });
  }

  try {
    const result = await execute();
    observability.logger.info("preventive maintenance cron completed", observability.elapsed({
      event: "cron.preventive_maintenance.completed",
      examined: result.examined,
      created: result.created,
      skipped: result.skipped,
      failed: result.failed,
    }));
    return observability.correlate(NextResponse.json(result, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("preventive maintenance cron failed", error, observability.elapsed({ event: "cron.preventive_maintenance.failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/cron/preventive-maintenance");
  try {
    const user = await getCurrentUser();
    if (!user) {
      observability.logger.warn("manual preventive maintenance run rejected", observability.elapsed({ event: "cron.preventive_maintenance.manual_unauthorized" }));
      return apiErrorResponse({ status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", requestId: observability.requestId });
    }
    if (!user.company_id) {
      observability.logger.warn("manual preventive maintenance run missing company", observability.elapsed({ event: "cron.preventive_maintenance.manual_missing_company", userId: user.id }));
      return apiErrorResponse({ status: 400, code: API_ERROR_CODES.validationFailed, message: "Användaren saknar organisation", requestId: observability.requestId });
    }
    if (!canAssignWorkOrders(user.role)) {
      observability.logger.warn("manual preventive maintenance run forbidden", observability.elapsed({ event: "cron.preventive_maintenance.manual_forbidden", userId: user.id, companyId: user.company_id }));
      return apiErrorResponse({ status: 403, code: API_ERROR_CODES.forbidden, message: "Du saknar behörighet", requestId: observability.requestId });
    }

    const result = await execute(user.company_id);
    await writeAuditLog(user, {
      entityType: "preventive_maintenance",
      entityId: user.company_id,
      action: "preventive_maintenance.manual_run",
      metadata: { ...result, storage: "CronJobRun" },
    });
    observability.logger.info("manual preventive maintenance run completed", observability.elapsed({
      event: "cron.preventive_maintenance.manual_completed",
      userId: user.id,
      companyId: user.company_id,
      created: result.created,
      skipped: result.skipped,
      failed: result.failed,
    }));
    return observability.correlate(NextResponse.json(result, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("manual preventive maintenance run failed", error, observability.elapsed({ event: "cron.preventive_maintenance.manual_failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}
