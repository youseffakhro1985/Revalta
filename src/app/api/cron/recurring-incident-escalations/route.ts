import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canAssignWorkOrders, getCurrentUser } from "@/lib/current-user";
import { isCronRequestAuthorized } from "@/lib/request-security";
import { createRouteObservability } from "@/lib/route-observability";
import { runRecurringIncidentEscalation } from "@/lib/recurring-incident-escalation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB_TYPE = "recurring_incident_escalation_run";
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
    const result = await runRecurringIncidentEscalation({ companyId });
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
  const observability = createRouteObservability(request, "/api/cron/recurring-incident-escalations");
  if (!isCronRequestAuthorized(request)) {
    observability.logger.warn("recurring incident escalation cron rejected", observability.elapsed({ event: "cron.recurring_incident_escalations.unauthorized" }));
    return apiErrorResponse({ status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", requestId: observability.requestId });
  }

  try {
    const result = await execute();
    observability.logger.info("recurring incident escalation cron completed", observability.elapsed({
      event: "cron.recurring_incident_escalations.completed",
      companies: result.companies,
      scanned: result.scanned,
      escalated: result.escalated,
      skipped: result.skipped,
      failed: result.failed,
    }));
    return observability.correlate(NextResponse.json(result, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("recurring incident escalation cron failed", error, observability.elapsed({ event: "cron.recurring_incident_escalations.failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/cron/recurring-incident-escalations");
  try {
    const user = await getCurrentUser();
    if (!user) {
      observability.logger.warn("manual recurring incident escalation run rejected", observability.elapsed({ event: "cron.recurring_incident_escalations.manual_unauthorized" }));
      return apiErrorResponse({ status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", requestId: observability.requestId });
    }
    if (!user.company_id) {
      observability.logger.warn("manual recurring incident escalation run missing company", observability.elapsed({ event: "cron.recurring_incident_escalations.manual_missing_company", userId: user.id }));
      return apiErrorResponse({ status: 400, code: API_ERROR_CODES.validationFailed, message: "Användaren saknar organisation", requestId: observability.requestId });
    }
    if (!canAssignWorkOrders(user.role)) {
      observability.logger.warn("manual recurring incident escalation run forbidden", observability.elapsed({ event: "cron.recurring_incident_escalations.manual_forbidden", userId: user.id, companyId: user.company_id }));
      return apiErrorResponse({ status: 403, code: API_ERROR_CODES.forbidden, message: "Du saknar behörighet", requestId: observability.requestId });
    }

    const result = await execute(user.company_id);
    await writeAuditLog(user, {
      entityType: "recurring_work_order_incident",
      entityId: user.company_id,
      action: "recurring_incident_escalation.manual_run",
      metadata: { ...result, storage: "CronJobRun" },
    });
    observability.logger.info("manual recurring incident escalation run completed", observability.elapsed({
      event: "cron.recurring_incident_escalations.manual_completed",
      userId: user.id,
      companyId: user.company_id,
      escalated: result.escalated,
      skipped: result.skipped,
      failed: result.failed,
    }));
    return observability.correlate(NextResponse.json(result, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("manual recurring incident escalation run failed", error, observability.elapsed({ event: "cron.recurring_incident_escalations.manual_failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}
