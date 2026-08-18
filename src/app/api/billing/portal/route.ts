import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { getPublicAppUrl } from "@/lib/app-url";
import { canManageBilling, getCurrentUser } from "@/lib/current-user";
import db from "@/lib/db";
import { recordPaymentEvent } from "@/lib/integrations";
import { createRouteObservability } from "@/lib/route-observability";
import { isProductionRuntime } from "@/lib/runtime-env";
import { createCustomerPortalSession, isStripeReady } from "@/lib/stripe";

const ROUTE = "/api/billing/portal";
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
  observability.logger.warn("billing portal request rejected", observability.elapsed({
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

export async function POST(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "billing.portal.unauthorized",
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att öppna kundportal",
        event: "billing.portal.missing_company",
        context: { userId: user.id },
      });
    }
    const companyId = user.company_id;
    if (!canManageBilling(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att öppna kundportal",
        event: "billing.portal.forbidden",
        context: { userId: user.id, companyId },
      });
    }

    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { stripe_customer_id: true },
    });
    const customerId = company?.stripe_customer_id;
    const origin = getPublicAppUrl(request.url);

    if (!isStripeReady() || !customerId) {
      try {
        await recordPaymentEvent(user, {
          mode: "customer_portal_mock",
          reason: "stripe_not_configured_or_customer_missing",
        });
      } catch {
        observability.logger.warn("billing portal telemetry failed", observability.elapsed({
          event: "billing.portal.telemetry_failed",
          phase: "unavailable",
          userId: user.id,
          companyId,
        }));
      }

      if (isProductionRuntime()) {
        return reject(observability, {
          status: 503,
          code: API_ERROR_CODES.serviceUnavailable,
          message: "Stripe-kundportal är inte tillgänglig i produktion",
          event: "billing.portal.stripe_unavailable",
          context: { userId: user.id, companyId },
        });
      }

      observability.logger.info("billing mock portal created", observability.elapsed({
        event: "billing.portal.mock_created",
        userId: user.id,
        companyId,
      }));
      return successResponse(observability, {
        success: true,
        mode: "mock",
        url: `${origin}/dashboard/billing?mockPortal=true`,
      });
    }

    const session = await createCustomerPortalSession({
      customerId,
      returnUrl: `${origin}/dashboard/billing`,
    });

    // Stripe already created the external portal session. Telemetry must not
    // turn that success into a false 500 and cause needless duplicate retries.
    try {
      await recordPaymentEvent(user, { mode: "customer_portal", sessionCreated: true });
    } catch {
      observability.logger.warn("billing portal telemetry failed", observability.elapsed({
        event: "billing.portal.telemetry_failed",
        phase: "live",
        userId: user.id,
        companyId,
      }));
    }

    observability.logger.info("billing portal created", observability.elapsed({
      event: "billing.portal.created",
      userId: user.id,
      companyId,
    }));
    return successResponse(observability, { success: true, mode: "live", url: session.url });
  } catch (error) {
    observability.logger.error("billing portal failed", error, observability.elapsed({
      event: "billing.portal.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
