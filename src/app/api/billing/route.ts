import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { writeAuditLog } from "@/lib/audit";
import { canManageBilling, getCurrentUser, tenantWhere } from "@/lib/current-user";
import db from "@/lib/db";
import { recordPaymentEvent } from "@/lib/integrations";
import { createRouteObservability } from "@/lib/route-observability";
import { isProductionRuntime } from "@/lib/runtime-env";

const ROUTE = "/api/billing";
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const plans = {
  start: { label: "Start", price: 495, propertyLimit: 10, teamLimit: 3 },
  professional: { label: "Standard", price: 995, propertyLimit: 75, teamLimit: 15 },
  enterprise: { label: "Professional", price: 1995, propertyLimit: 999, teamLimit: 100 },
};

function successResponse(
  observability: ReturnType<typeof createRouteObservability>,
  body: unknown,
  init?: ResponseInit,
) {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(SUCCESS_HEADERS)) headers.set(name, value);
  return observability.correlate(NextResponse.json(body, { ...init, headers }));
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
  observability.logger.warn("billing request rejected", observability.elapsed({
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
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "billing.read.unauthorized",
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Företag saknas",
        event: "billing.read.missing_company",
        context: { userId: user.id },
      });
    }
    const companyId = user.company_id;
    if (!canManageBilling(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att visa abonnemang",
        event: "billing.read.forbidden",
        context: { userId: user.id, companyId },
      });
    }

    const [properties, teamMembers, openTickets, company] = await Promise.all([
      db.property.count({ where: { deleted_at: null, ...tenantWhere(user) } }),
      db.user.count({ where: { company_id: companyId } }),
      db.ticket.count({
        where: {
          deleted_at: null,
          ...tenantWhere(user),
          status: { not: "closed" },
          OR: [{ property_id: null }, { property: { deleted_at: null } }],
        },
      }),
      db.company.findUnique({
        where: { id: companyId },
        select: {
          stripe_customer_id: true,
          stripe_subscription_id: true,
          subscription_status: true,
        },
      }),
    ]);

    observability.logger.info("billing summary completed", observability.elapsed({
      event: "billing.read.completed",
      userId: user.id,
      companyId,
      properties,
      teamMembers,
      openTickets,
    }));

    return successResponse(observability, {
      currentPlan: user.company?.plan || "professional",
      plans,
      usage: { properties, teamMembers, openTickets },
      canManage: canManageBilling(user.role),
      // Direct plan writes (PATCH below) are a dev/preview convenience only — in
      // production, plan changes must go through Stripe Checkout so billing stays
      // in sync with what the customer actually pays.
      canDirectChangePlan: !isProductionRuntime(),
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
      stripeCustomerId: company?.stripe_customer_id || null,
      stripeSubscriptionId: company?.stripe_subscription_id || null,
      subscriptionStatus: company?.subscription_status || null,
    });
  } catch (error) {
    observability.logger.error("billing summary failed", error, observability.elapsed({
      event: "billing.read.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}

export async function PATCH(request: Request) {
  const observability = createRouteObservability(request, ROUTE);

  try {
    const user = await getCurrentUser();
    if (!user) {
      return reject(observability, {
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Obehörig",
        event: "billing.plan_change.unauthorized",
      });
    }
    if (!user.company_id) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att ändra plan",
        event: "billing.plan_change.missing_company",
        context: { userId: user.id },
      });
    }
    const companyId = user.company_id;
    if (!canManageBilling(user.role)) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Du saknar behörighet att ändra plan",
        event: "billing.plan_change.forbidden",
        context: { userId: user.id, companyId },
      });
    }

    // Plan changes are a money flow. In production this must go through a real
    // Stripe Checkout session; the webhook is the only production writer of the
    // paid plan so a customer can never self-grant a higher tier.
    if (isProductionRuntime()) {
      return reject(observability, {
        status: 403,
        code: API_ERROR_CODES.forbidden,
        message: "Planbyten görs via Stripe Checkout i produktion. Använd \"Starta Stripe Checkout\".",
        event: "billing.plan_change.production_blocked",
        context: { userId: user.id, companyId },
      });
    }

    const body = await request.json().catch(() => ({}));
    const plan = typeof body?.plan === "string" ? body.plan : "";
    if (!(plan in plans)) {
      return reject(observability, {
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ogiltig plan",
        event: "billing.plan_change.validation_failed",
        context: { reason: "invalid_plan", userId: user.id, companyId },
      });
    }

    const company = await db.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id: companyId },
        data: { plan },
        select: { id: true, name: true, plan: true },
      });

      await writeAuditLog(user, {
        entityType: "company",
        entityId: updated.id,
        action: "billing.plan_changed",
        metadata: { schemaVersion: 2, plan },
      }, tx);

      return updated;
    });

    try {
      await recordPaymentEvent(user, { companyId, plan, mode: "plan_change" });
    } catch {
      // IntegrationEvent is operational telemetry, not the source of truth for
      // this non-production plan change. Do not report a false failed mutation
      // after the atomic company+audit transaction has committed.
      observability.logger.warn("billing payment event recording failed", observability.elapsed({
        event: "billing.plan_change.telemetry_failed",
        userId: user.id,
        companyId,
        plan,
      }));
    }

    observability.logger.info("billing plan change completed", observability.elapsed({
      event: "billing.plan_change.completed",
      userId: user.id,
      companyId,
      plan,
    }));
    return successResponse(observability, { success: true, company });
  } catch (error) {
    observability.logger.error("billing plan change failed", error, observability.elapsed({
      event: "billing.plan_change.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
