import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { canManageBilling, getCurrentUser } from "@/lib/current-user";
import { recordPaymentEvent } from "@/lib/integrations";
import { isProductionRuntime } from "@/lib/runtime-env";
import { createCheckoutSession, isStripeReady } from "@/lib/stripe";
import { createLogger } from "@/lib/structured-logger";

const allowedPlans = new Set(["start", "professional", "enterprise"]);

const logger = createLogger({ route: "/api/billing/checkout" });

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id || !canManageBilling(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att starta checkout" }, { status: 403 });
    }

    const { plan } = await request.json();
    if (typeof plan !== "string" || !allowedPlans.has(plan)) {
      return NextResponse.json({ error: "Ogiltig plan" }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    if (!isStripeReady(plan)) {
      await recordPaymentEvent(user, { plan, mode: "checkout_mock", reason: "stripe_not_configured" });
      // Billing is a money flow: always fail closed in production, even if
      // ALLOW_INTEGRATION_MOCKS=1 was set (e.g. copied from a preview env group).
      // Only the storage route previously had this stricter guard; checkout/portal
      // must never return a fake "success" payment to a real customer.
      if (isProductionRuntime()) {
        return NextResponse.json({ error: "Stripe är inte konfigurerad i produktion" }, { status: 503 });
      }
      return NextResponse.json({
        success: true,
        mode: "mock",
        url: `${origin}/dashboard/billing?mockCheckout=${plan}`,
      });
    }

    const session = await createCheckoutSession({
      plan,
      customerEmail: user.email,
      companyId: user.company_id,
      successUrl: `${origin}/dashboard/billing?checkout=success&plan=${plan}`,
      cancelUrl: `${origin}/dashboard/billing?checkout=cancelled`,
    });

    await writeAuditLog(user, {
      entityType: "company",
      entityId: user.company_id,
      action: "billing.checkout_started",
      metadata: { plan, sessionId: session.id },
    });
    await recordPaymentEvent(user, { plan, mode: "checkout", sessionId: session.id });

    return NextResponse.json({ success: true, mode: "live", url: session.url });
  } catch (error) {
    logger.error("Create checkout error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
