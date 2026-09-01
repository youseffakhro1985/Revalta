import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { runServiceEscalations } from "@/lib/service-escalation-engine";
import { isCronRequestAuthorized } from "@/lib/request-security";
import { createRouteObservability } from "@/lib/route-observability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB_TYPE = "service_assignment_escalation_run";
const SAFE_RUN_ERROR = "Körningen misslyckades";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

async function execute() {
  const run = await db.cronJobRun.create({
    data: {
      company_id: null,
      job_type: JOB_TYPE,
      status: "processing",
      recipient: "all-companies",
      payload: { startedAt: new Date().toISOString() },
    },
  });

  try {
    const result = await runServiceEscalations();
    await db.cronJobRun.update({
      where: { id: run.id },
      data: {
        status: result.failed > 0 ? "partial" : "sent",
        payload: { ...result, completedAt: new Date().toISOString() },
      },
    });
    return result;
  } catch (error) {
    await db.cronJobRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        payload: { error: SAFE_RUN_ERROR, completedAt: new Date().toISOString() },
      },
    });
    throw error;
  }
}

export async function GET(request: Request) {
  const observability = createRouteObservability(request, "/api/cron/service-assignment-escalations");
  if (!isCronRequestAuthorized(request)) {
    observability.logger.warn("service assignment escalation cron rejected", observability.elapsed({ event: "cron.service_assignment_escalations.unauthorized" }));
    return apiErrorResponse({ status: 401, code: API_ERROR_CODES.unauthorized, message: "Obehörig", requestId: observability.requestId });
  }

  try {
    const result = await execute();
    observability.logger.info("service assignment escalation cron completed", observability.elapsed({
      event: "cron.service_assignment_escalations.completed",
      candidates: result.candidates,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
    }));
    return observability.correlate(NextResponse.json(result, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("service assignment escalation cron failed", error, observability.elapsed({ event: "cron.service_assignment_escalations.failed" }));
    return apiErrorResponse({ status: 500, code: API_ERROR_CODES.internalError, message: "Internt serverfel", requestId: observability.requestId });
  }
}
