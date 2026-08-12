import { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { verifyStripeSignature } from "@/lib/stripe";
import { NextResponse } from "next/server";
import { createRouteObservability } from "@/lib/route-observability";

type StripeObject = {
  id?: string;
  customer?: string;
  subscription?: string;
  status?: string;
  metadata?: Record<string, string>;
};

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: StripeObject };
};

const supportedEvents = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

function getPlanFromMetadata(object: StripeObject) {
  const plan = object.metadata?.plan;
  return plan === "start" || plan === "professional" || plan === "enterprise" ? plan : undefined;
}

async function resolveCompanyForStripeObject(client: Prisma.TransactionClient, object: StripeObject) {
  const customerId = typeof object.customer === "string" ? object.customer : null;
  const subscriptionId =
    typeof object.subscription === "string"
      ? object.subscription
      : typeof object.id === "string" && object.id.startsWith("sub_")
        ? object.id
        : null;
  const metadataCompanyId = object.metadata?.companyId?.trim() || null;

  if (subscriptionId) {
    const bySubscription = await client.company.findFirst({
      where: { stripe_subscription_id: subscriptionId },
      select: { id: true, stripe_customer_id: true, stripe_subscription_id: true },
    });
    if (bySubscription) {
      if (customerId && bySubscription.stripe_customer_id && bySubscription.stripe_customer_id !== customerId) {
        return null;
      }
      if (metadataCompanyId && metadataCompanyId !== bySubscription.id) {
        return null;
      }
      return bySubscription;
    }
  }

  if (customerId) {
    const byCustomer = await client.company.findFirst({
      where: { stripe_customer_id: customerId },
      select: { id: true, stripe_customer_id: true, stripe_subscription_id: true },
    });
    if (byCustomer) {
      if (metadataCompanyId && metadataCompanyId !== byCustomer.id) {
        return null;
      }
      return byCustomer;
    }
  }

  // First binding only: accept metadata companyId when no Stripe ids are mapped yet.
  if (metadataCompanyId && (customerId || subscriptionId)) {
    const byMetadata = await client.company.findFirst({
      where: {
        id: metadataCompanyId,
        OR: [
          { stripe_customer_id: null },
          ...(customerId ? [{ stripe_customer_id: customerId }] : []),
        ],
      },
      select: { id: true, stripe_customer_id: true, stripe_subscription_id: true },
    });
    if (byMetadata) return byMetadata;
  }

  return null;
}

async function updateCompanyFromStripeObject(client: Prisma.TransactionClient, object: StripeObject) {
  const company = await resolveCompanyForStripeObject(client, object);
  if (!company) return null;

  const plan = getPlanFromMetadata(object);
  return client.company.update({
    where: { id: company.id },
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
  const observability = createRouteObservability(request, "/api/stripe/webhook");
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyStripeSignature(payload, signature)) {
    return NextResponse.json({ error: "Ogiltig Stripe-signatur" }, { status: 400 });
  }

  try {
    const event = JSON.parse(payload) as StripeEvent;
    if (typeof event.id !== "string" || !event.id.startsWith("evt_") || typeof event.type !== "string") {
      return NextResponse.json({ error: "Ogiltig Stripe-payload" }, { status: 400 });
    }
    const object = event.data?.object;

    if (object && supportedEvents.has(event.type)) {
      const duplicate = await db.$transaction(async (tx) => {
          // Serialize deliveries of the same Stripe event without requiring a new
          // database table to exist before this application version is deployed.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stripe:${event.id}`}))`;
          const existingEvent = await tx.integrationEvent.findFirst({
            where: { type: "stripe", recipient: event.id },
            select: { id: true },
          });
          if (existingEvent) return true;

          const company = await updateCompanyFromStripeObject(tx, object);
          await tx.integrationEvent.create({
            data: {
              company_id: company?.id,
              type: "stripe",
              status: company ? "received" : "ignored",
              recipient: event.id,
              payload: {
                eventType: event.type,
                objectId: object.id,
                customer: object.customer,
                subscription: object.subscription,
                status: object.status,
                matchedCompany: Boolean(company),
                metadataCompanyId: object.metadata?.companyId || null,
              },
            },
          });
          return false;
        });
      if (duplicate) {
        observability.logger.info("stripe webhook duplicate acknowledged", observability.elapsed({
          event: "stripe.webhook.duplicate",
          stripeEventId: event.id,
          stripeEventType: event.type,
        }));
        return NextResponse.json({ received: true, duplicate: true });
      }
    }

    observability.logger.info("stripe webhook received", observability.elapsed({
      event: "stripe.webhook.received",
      stripeEventId: event.id,
      stripeEventType: event.type,
      supported: supportedEvents.has(event.type),
    }));
    return NextResponse.json({ received: true });
  } catch (error) {
    observability.logger.error("stripe webhook failed", error, observability.elapsed({
      event: "stripe.webhook.failed",
    }));
    return NextResponse.json({ error: "Ogiltig Stripe-payload" }, { status: 400 });
  }
}
