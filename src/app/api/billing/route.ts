import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageBilling, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { recordPaymentEvent } from "@/lib/integrations";
import { isProductionRuntime } from "@/lib/runtime-env";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/billing" });

const plans = {
  start: { label: "Start", price: 495, propertyLimit: 10, teamLimit: 3 },
  professional: { label: "Standard", price: 995, propertyLimit: 75, teamLimit: 15 },
  enterprise: { label: "Professional", price: 1995, propertyLimit: 999, teamLimit: 100 },
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Företag saknas" }, { status: 400 });
    if (!canManageBilling(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att visa abonnemang" }, { status: 403 });
    }

    const [properties, teamMembers, openTickets] = await Promise.all([
      db.property.count({ where: { deleted_at: null, ...tenantWhere(user) } }),
      db.user.count({ where: { company_id: user.company_id } }),
      db.ticket.count({
        where: {
          deleted_at: null,
          ...tenantWhere(user),
          status: { not: "closed" },
          OR: [{ property_id: null }, { property: { deleted_at: null } }],
        },
      }),
    ]);
    const company = await db.company.findUnique({
      where: { id: user.company_id },
      select: {
        stripe_customer_id: true,
        stripe_subscription_id: true,
        subscription_status: true,
      },
    });

    return NextResponse.json({
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
    logger.error("Get billing error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id || !canManageBilling(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att ändra plan" }, { status: 403 });
    }

    // Plan changes are a money flow. In production this must go through a real
    // Stripe Checkout session (the webhook is what actually updates company.plan
    // from there) — never a free-form write straight to the plan field, which
    // would let a customer grant themselves a higher tier without paying for it.
    // Left enabled outside production so dev/preview environments without live
    // Stripe keys can still exercise plan changes end to end.
    if (isProductionRuntime()) {
      return NextResponse.json(
        { error: "Planbyten görs via Stripe Checkout i produktion. Använd \"Starta Stripe Checkout\"." },
        { status: 403 },
      );
    }

    const { plan } = await request.json();
    if (typeof plan !== "string" || !(plan in plans)) {
      return NextResponse.json({ error: "Ogiltig plan" }, { status: 400 });
    }

    const company = await db.company.update({
      where: { id: user.company_id },
      data: { plan },
      select: { id: true, name: true, plan: true },
    });

    await writeAuditLog(user, {
      entityType: "company",
      entityId: company.id,
      action: "billing.plan_changed",
      metadata: { plan },
    });
    await recordPaymentEvent(user, { companyId: company.id, plan, mode: "plan_change" });

    return NextResponse.json({ success: true, company });
  } catch (error) {
    logger.error("Update billing error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
