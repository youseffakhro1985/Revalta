import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { isBillingPlanKey } from "@/lib/billing-plans";
import db from "@/lib/db";
import { createRouteObservability } from "@/lib/route-observability";
import { verifyStripeSignature } from "@/lib/stripe";

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
  created?: number;
  data?: { object?: StripeObject };
};

type SafeStripeEvent = StripeEvent & { id: string; type: string };

const supportedEvents = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

const subscriptionEvents = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

const invoiceEvents = new Set([
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function previousReplayCount(payload: unknown) {
  const row = object(payload);
  const value = row?.replayCount;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function getPlanFromMetadata(stripeObject: StripeObject) {
  const plan = stripeObject.metadata?.plan;
  return isBillingPlanKey(plan) ? plan : undefined;
}

function getSubscriptionId(stripeObject: StripeObject) {
  if (typeof stripeObject.subscription === "string" && stripeObject.subscription.startsWith("sub_")) {
    return stripeObject.subscription;
  }
  if (typeof stripeObject.id === "string" && stripeObject.id.startsWith("sub_")) {
    return stripeObject.id;
  }
  return null;
}

async function resolveCompanyForStripeObject(client: Prisma.TransactionClient, stripeObject: StripeObject) {
  const customerId = typeof stripeObject.customer === "string" ? stripeObject.customer : null;
  const subscriptionId = getSubscriptionId(stripeObject);
  const metadataCompanyId = stripeObject.metadata?.companyId?.trim() || null;

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

async function isStaleSubscriptionEvent(
  client: Prisma.TransactionClient,
  companyId: string,
  event: SafeStripeEvent,
  stripeObject: StripeObject,
) {
  if (!subscriptionEvents.has(event.type)) return false;
  const incomingCreated = typeof event.created === "number" && Number.isFinite(event.created)
    ? event.created
    : null;
  const subscriptionId = getSubscriptionId(stripeObject);
  if (incomingCreated === null || !subscriptionId) return false;

  const recentEvents = await client.integrationEvent.findMany({
    where: { company_id: companyId, type: "stripe", status: "received" },
    orderBy: { created_at: "desc" },
    take: 100,
    select: { payload: true },
  });

  return recentEvents.some(({ payload }) => {
    const row = object(payload);
    const eventType = typeof row?.eventType === "string" ? row.eventType : null;
    if (!eventType || !subscriptionEvents.has(eventType)) return false;

    const eventCreated = typeof row?.eventCreated === "number" && Number.isFinite(row.eventCreated)
      ? row.eventCreated
      : null;
    if (eventCreated === null || eventCreated <= incomingCreated) return false;

    const storedSubscriptionId =
      typeof row?.subscription === "string" && row.subscription.startsWith("sub_")
        ? row.subscription
        : typeof row?.objectId === "string" && row.objectId.startsWith("sub_")
          ? row.objectId
          : null;
    return storedSubscriptionId === subscriptionId;
  });
}

async function applyStripeEventToCompany(
  client: Prisma.TransactionClient,
  event: SafeStripeEvent,
  stripeObject: StripeObject,
) {
  const company = await resolveCompanyForStripeObject(client, stripeObject);
  if (!company) return null;

  // Invoice state (paid/open/etc.) and Checkout Session state (complete/open/etc.)
  // are not subscription lifecycle states. Only subscription events may write
  // Company.subscription_status. Invoice events are journal-only after matching.
  if (invoiceEvents.has(event.type)) return { company, stale: false };

  const stale = await isStaleSubscriptionEvent(client, company.id, event, stripeObject);
  if (stale) return { company, stale: true };

  const plan = getPlanFromMetadata(stripeObject);
  const customerId = typeof stripeObject.customer === "string" ? stripeObject.customer : undefined;
  const subscriptionId = getSubscriptionId(stripeObject) ?? undefined;

  const updatedCompany = await client.company.update({
    where: { id: company.id },
    data: {
      ...(plan ? { plan } : {}),
      ...(customerId ? { stripe_customer_id: customerId } : {}),
      ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
      ...(subscriptionEvents.has(event.type) && typeof stripeObject.status === "string"
        ? { subscription_status: stripeObject.status }
        : {}),
    },
    select: {
      id: true,
      name: true,
      plan: true,
      stripe_customer_id: true,
      stripe_subscription_id: true,
      subscription_status: true,
    },
  });
  return { company: updatedCompany, stale: false };
}

function journalPayload(
  event: SafeStripeEvent,
  stripeObject: StripeObject,
  matchedCompany: boolean,
  replayCount: number,
  stale: boolean,
) {
  return {
    eventType: event.type,
    eventCreated: typeof event.created === "number" && Number.isFinite(event.created) ? event.created : null,
    objectId: stripeObject.id,
    customer: stripeObject.customer,
    subscription: stripeObject.subscription,
    status: stripeObject.status,
    matchedCompany,
    metadataCompanyId: stripeObject.metadata?.companyId || null,
    replayCount,
    stale,
  } as Prisma.InputJsonValue;
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/stripe/webhook");
  const acknowledge = (body: { received: true; duplicate?: true }) =>
    observability.correlate(NextResponse.json(body, { headers: SUCCESS_HEADERS }));

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyStripeSignature(payload, signature)) {
    observability.logger.warn("stripe webhook signature rejected", observability.elapsed({
      event: "stripe.webhook.signature_invalid",
    }));
    return apiErrorResponse({
      status: 400,
      code: API_ERROR_CODES.validationFailed,
      message: "Ogiltig Stripe-signatur",
      requestId: observability.requestId,
    });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    observability.logger.warn("stripe webhook payload rejected", observability.elapsed({
      event: "stripe.webhook.payload_invalid",
    }));
    return apiErrorResponse({
      status: 400,
      code: API_ERROR_CODES.validationFailed,
      message: "Ogiltig Stripe-payload",
      requestId: observability.requestId,
    });
  }

  if (typeof event.id !== "string" || !event.id.startsWith("evt_") || typeof event.type !== "string") {
    observability.logger.warn("stripe webhook payload rejected", observability.elapsed({
      event: "stripe.webhook.payload_invalid",
    }));
    return apiErrorResponse({
      status: 400,
      code: API_ERROR_CODES.validationFailed,
      message: "Ogiltig Stripe-payload",
      requestId: observability.requestId,
    });
  }

  const safeEvent = event as SafeStripeEvent;
  const stripeObject = safeEvent.data?.object;
  const supported = supportedEvents.has(safeEvent.type);
  if (supported && !stripeObject) {
    observability.logger.warn("stripe webhook payload rejected", observability.elapsed({
      event: "stripe.webhook.payload_invalid",
      stripeEventId: safeEvent.id,
      stripeEventType: safeEvent.type,
    }));
    return apiErrorResponse({
      status: 400,
      code: API_ERROR_CODES.validationFailed,
      message: "Ogiltig Stripe-payload",
      requestId: observability.requestId,
    });
  }

  observability.logger.info("stripe webhook received", observability.elapsed({
    event: "stripe.webhook.received",
    stripeEventId: safeEvent.id,
    stripeEventType: safeEvent.type,
    supported,
  }));

  try {
    if (stripeObject && supported) {
      const outcome = await db.$transaction(async (tx) => {
        // Serialize deliveries of the same Stripe event. A completed event is a
        // true duplicate. An earlier unmatched/ignored event is deliberately
        // replayable so a later Stripe mapping can recover it without creating
        // a second journal row.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stripe:${safeEvent.id}`}))`;
        const subscriptionId = subscriptionEvents.has(safeEvent.type) ? getSubscriptionId(stripeObject) : null;
        if (subscriptionId) {
          // Different event ids for the same subscription must also serialize,
          // otherwise two out-of-order deliveries can both observe old state.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stripe-subscription:${subscriptionId}`}))`;
        }

        const existingEvent = await tx.integrationEvent.findFirst({
          where: { type: "stripe", recipient: safeEvent.id },
          select: { id: true, status: true, payload: true },
        });
        if (existingEvent && existingEvent.status !== "ignored") {
          return { duplicate: true, replayed: false, matchedCompany: true, stale: false };
        }

        const replayCount = existingEvent ? previousReplayCount(existingEvent.payload) + 1 : 0;
        const application = await applyStripeEventToCompany(tx, safeEvent, stripeObject);
        const company = application?.company ?? null;
        const stale = application?.stale ?? false;
        const status = company ? "received" : "ignored";
        const eventPayload = journalPayload(safeEvent, stripeObject, Boolean(company), replayCount, stale);

        if (existingEvent) {
          await tx.integrationEvent.update({
            where: { id: existingEvent.id },
            data: {
              company_id: company?.id ?? null,
              status,
              payload: eventPayload,
            },
          });
          return { duplicate: false, replayed: true, matchedCompany: Boolean(company), stale };
        }

        await tx.integrationEvent.create({
          data: {
            company_id: company?.id,
            type: "stripe",
            status,
            recipient: safeEvent.id,
            payload: eventPayload,
          },
        });
        return { duplicate: false, replayed: false, matchedCompany: Boolean(company), stale };
      });

      if (outcome.duplicate) {
        observability.logger.info("stripe webhook duplicate acknowledged", observability.elapsed({
          event: "stripe.webhook.duplicate",
          stripeEventId: safeEvent.id,
          stripeEventType: safeEvent.type,
        }));
        return acknowledge({ received: true, duplicate: true });
      }

      if (outcome.stale) {
        observability.logger.info("stripe webhook stale subscription event ignored", observability.elapsed({
          event: "stripe.webhook.stale_subscription_event",
          stripeEventId: safeEvent.id,
          stripeEventType: safeEvent.type,
        }));
      }

      if (outcome.replayed) {
        observability.logger.info("stripe webhook replay evaluated", observability.elapsed({
          event: "stripe.webhook.replayed",
          stripeEventId: safeEvent.id,
          stripeEventType: safeEvent.type,
          matchedCompany: outcome.matchedCompany,
          stale: outcome.stale,
        }));
      }
    }

    observability.logger.info("stripe webhook processed", observability.elapsed({
      event: "stripe.webhook.processed",
      stripeEventId: safeEvent.id,
      stripeEventType: safeEvent.type,
      supported,
    }));
    return acknowledge({ received: true });
  } catch (error) {
    observability.logger.error("stripe webhook failed", error, observability.elapsed({
      event: "stripe.webhook.failed",
      stripeEventId: safeEvent.id,
      stripeEventType: safeEvent.type,
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
