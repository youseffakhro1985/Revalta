import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { isCronRequestAuthorized } from "@/lib/request-security";
import { createRouteObservability } from "@/lib/route-observability";
import { runServiceEscalations } from "@/lib/service-escalation-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/cron/service-assignment-escalations";
const JOB = "service_assignment_escalations";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  if (!isCronRequestAuthorized(request)) {
    observability.logger.warn("service assignment cron rejected", observability.elapsed({
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

  observability.logger.info("service assignment cron started", observability.elapsed({
    event: "cron.started",
    job: JOB,
  }));

  try {
    const result = await runServiceEscalations();
    const context = observability.elapsed({
      job: JOB,
      candidates: result.candidates,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
      disabledCompanies: result.disabledCompanies,
    });

    if (result.failed > 0) {
      observability.logger.warn("service assignment cron partially failed", {
        event: "cron.partial_failure",
        ...context,
      });
    } else {
      observability.logger.info("service assignment cron completed", {
        event: "cron.completed",
        ...context,
      });
    }

    return observability.correlate(NextResponse.json(result, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("service assignment cron failed", error, observability.elapsed({
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
