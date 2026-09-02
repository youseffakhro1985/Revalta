import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { getPublicAppUrl } from "@/lib/app-url";
import { writeAuditLog } from "@/lib/audit";
import { isBillingPlanKey } from "@/lib/billing-plans";
import { canManageBilling, getCurrentUser } from "@/lib/current-user";
import { recordPaymentEvent } from "@/lib/integrations";
import { createRouteObservability } from "@/lib/route-observability";
import { isProductionRuntime } from "@/lib/runtime-env";
import { createCheckoutSession, isStripeReady } from "@/lib/stripe";

const ROUTE = "/api/billing/checkout";
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
  observability.logger.warn("billing checkout request rejected", observability.elapsed({
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
        event: "billing.checkout.unauthorized",
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att starta checkout",
        event: "billing.checkout.missing_company",
        context: { userId: user.id },
      });
    }
    const companyId = user.company_id;
    if (!canManageBilling(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att starta checkout",
        event: "billing.checkout.forbidden",
        context: { userId: user.id, companyId },
      });
    }

    const body = await request.json().catch(() => ({}));
    const plan = body?.plan;
    if (!isBillingPlanKey(plan)) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ogiltig plan",
        event: "billing.checkout.validation_failed",
        context: { reason: "invalid_plan", userId: user.id, companyId },
      });
    }

    const origin = getPublicAppUrl(request.url);
    if (!isStripeReady(plan)) {
      try {
        await recordPaymentEvent(user, { plan, mode: "checkout_mock", reason: "stripe_not_configured" });
      } catch {
        observability.logger.warn("billing checkout telemetry failed", observability.elapsed({
          event: "billing.checkout.telemetry_failed",
          phase: "unavailable",
          userId: user.id,
          companyId,
          plan,
        }));
      }

      if (isProductionRuntime()) {
        return reject(observability, {
          status: 503,
          code: API_ERROR_CODES.serviceUnavailable,
          message: "Stripe är inte konfigurerad i produktion",
          event: "billing.checkout.stripe_unavailable",
          context: { userId: user.id, companyId, plan },
        });
      }

      observability.logger.info("billing mock checkout created", observability.elapsed({
        event: "billing.checkout.mock_created",
        userId: user.id,
        companyId,
        plan,
      }));
      return successResponse(observability, {
        success: true,
        mode: "mock",
        url: `${origin}/dashboard/billing?mockCheckout=${plan}`,
      });
    }

    const session = await createCheckoutSession({
      plan,
      customerEmail: user.email,
      companyId,
      successUrl: `${origin}/dashboard/billing?checkout=success&plan=${plan}`,
      cancelUrl: `${origin}/dashboard/billing?checkout=cancelled`,
      idempotencyKey: `revalta-checkout:${companyId}:${plan}:${observability.requestId}`,
    });

    // Stripe already created an external side effect. Audit and telemetry are
    // best-effort after that point so a local logging outage cannot turn a
    // successful Stripe session into a false 500 and cause duplicate retries.
    try {
      await writeAuditLog(user, {
        entityType: "company",
        entityId: companyId,
        action: "billing.checkout_started",
        metadata: { schemaVersion: 2, plan, mode: "live" },
      });
    } catch {
      observability.logger.warn("billing checkout audit failed", observability.elapsed({
        event: "billing.checkout.audit_failed",
        userId: user.id,
        companyId,
        plan,
      }));
    }

    try {
      await recordPaymentEvent(user, { plan, mode: "checkout", sessionCreated: true });
    } catch {
      observability.logger.warn("billing checkout telemetry failed", observability.elapsed({
        event: "billing.checkout.telemetry_failed",
        phase: "live",
        userId: user.id,
        companyId,
        plan,
      }));
    }

    observability.logger.info("billing checkout created", observability.elapsed({
      event: "billing.checkout.created",
      userId: user.id,
      companyId,
      plan,
    }));
    return successResponse(observability, { success: true, mode: "live", url: session.url });
  } catch (error) {
    observability.logger.error("billing checkout failed", error, observability.elapsed({
      event: "billing.checkout.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
