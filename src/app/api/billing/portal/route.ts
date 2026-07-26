import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageBilling, getCurrentUser } from "@/lib/current-user";
import { recordPaymentEvent } from "@/lib/integrations";
import { allowIntegrationMocks } from "@/lib/runtime-env";
import { createCustomerPortalSession, isStripeReady } from "@/lib/stripe";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id || !canManageBilling(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att öppna kundportal" }, { status: 403 });
    }

    const company = await db.company.findUnique({
      where: { id: user.company_id },
      select: { stripe_customer_id: true },
    });
    const customerId = company?.stripe_customer_id;
    const origin = new URL(request.url).origin;

    if (!isStripeReady() || !customerId) {
      await recordPaymentEvent(user, { mode: "customer_portal_mock", reason: "stripe_not_configured_or_customer_missing" });
      if (!allowIntegrationMocks()) {
        return NextResponse.json({ error: "Stripe-kundportal är inte tillgänglig i produktion" }, { status: 503 });
      }
      return NextResponse.json({
        success: true,
        mode: "mock",
        url: `${origin}/dashboard/billing?mockPortal=true`,
      });
    }

    const session = await createCustomerPortalSession({
      customerId,
      returnUrl: `${origin}/dashboard/billing`,
    });
    await recordPaymentEvent(user, { mode: "customer_portal", sessionId: session.id });

    return NextResponse.json({ success: true, mode: "live", url: session.url });
  } catch (error) {
    console.error("Create customer portal error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
