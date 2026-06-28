import db from "@/lib/db";
import { verifyStripeSignature } from "@/lib/stripe";
import { NextResponse } from "next/server";

type StripeObject = {
  id?: string;
  customer?: string;
  subscription?: string;
  status?: string;
  metadata?: Record<string, string>;
};

function getPlanFromMetadata(object: StripeObject) {
  const plan = object.metadata?.plan;
  return plan === "start" || plan === "professional" || plan === "enterprise" ? plan : undefined;
}

async function updateCompanyFromStripeObject(object: StripeObject) {
  const companyId = object.metadata?.companyId;
  if (!companyId) return null;

  const plan = getPlanFromMetadata(object);
  return db.company.update({
    where: { id: companyId },
    data: {
      ...(plan ? { plan } : {}),
      stripe_customer_id: typeof object.customer === "string" ? object.customer : undefined,
      stripe_subscription_id: typeof object.subscription === "string" ? object.subscription : object.id,
      subscription_status: object.status,
    },
    select: { id: true, name: true, plan: true, stripe_customer_id: true, stripe_subscription_id: true, subscription_status: true },
  });
}

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyStripeSignature(payload, signature)) {
    return NextResponse.json({ error: "Ogiltig Stripe-signatur" }, { status: 400 });
  }

  try {
    const event = JSON.parse(payload) as { type: string; data?: { object?: StripeObject } };
    const object = event.data?.object;

    if (object && [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_succeeded",
      "invoice.payment_failed",
    ].includes(event.type)) {
      const company = await updateCompanyFromStripeObject(object);
      await db.integrationEvent.create({
        data: {
          company_id: company?.id,
          type: "stripe",
          status: "received",
          payload: {
            eventType: event.type,
            objectId: object.id,
            customer: object.customer,
            subscription: object.subscription,
            status: object.status,
          },
        },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
