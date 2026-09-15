import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import {
  canAccessResidentPortal,
  getCurrentUser,
  isResident,
  requireCompanyMember,
} from "@/lib/current-user";
import { loadResidentPortalNotices } from "@/lib/resident-portal-notices";
import { createRouteObservability } from "@/lib/route-observability";

const ROUTE = "/api/resident-portal/notices";
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
  observability.logger.warn("resident notice request rejected", observability.elapsed({
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

export async function GET(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = requireCompanyMember(await getCurrentUser());
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "resident_notices.list.unauthorized",
      });
    }
    if (!canAccessResidentPortal(user.role) || !isResident(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Endast boende kan använda denna yta",
        event: "resident_notices.list.forbidden",
        context: { userId: user.id, companyId: user.company_id },
      });
    }

    const payload = await loadResidentPortalNotices(user);

    observability.logger.info("resident notice list completed", observability.elapsed({
      event: "resident_notices.list.completed",
      userId: user.id,
      companyId: user.company_id,
      leaseCount: payload.leases.length,
      noticeCount: payload.notices.length,
    }));

    return successResponse(observability, payload);
  } catch (error) {
    observability.logger.error("resident notice list failed", error, observability.elapsed({
      event: "resident_notices.list.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
