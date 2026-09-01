import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { deliverDemoRequest, type DemoRequest } from "@/lib/demo-request-email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createRouteObservability } from "@/lib/route-observability";
import { isDeclaredRequestBodyTooLarge, isTrustedMutationRequest } from "@/lib/request-security";

const ROUTE = "/api/demo-request";
const HOUR_MS = 60 * 60 * 1000;
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizePayload(payload: Record<string, unknown>): DemoRequest & { website: string } {
  return {
    name: clean(payload.name, 120),
    email: clean(payload.email, 254).toLowerCase(),
    company: clean(payload.company, 160),
    phone: clean(payload.phone, 50),
    role: clean(payload.role, 120),
    portfolio: clean(payload.portfolio, 160),
    message: clean(payload.message, 2_000),
    website: clean(payload.website, 200),
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function retryAfterSeconds(resetAt: Date) {
  return Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, ROUTE);
  const reject = (status: number, code: Parameters<typeof apiErrorResponse>[0]["code"], message: string, event: string, headers?: HeadersInit) => {
    observability.logger.warn("demo request rejected", observability.elapsed({ event, status }));
    return apiErrorResponse({ status, code, message, requestId: observability.requestId, headers });
  };

  try {
    if (!isTrustedMutationRequest(request)) {
      return reject(403, API_ERROR_CODES.untrustedMutation, "Begäran kunde inte verifieras", "demo_request.untrusted_origin");
    }
    if (isDeclaredRequestBodyTooLarge(request)) {
      return reject(413, API_ERROR_CODES.payloadTooLarge, "Förfrågan är för stor", "demo_request.payload_too_large");
    }

    let payload: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid json object");
      payload = parsed as Record<string, unknown>;
    } catch {
      return reject(400, API_ERROR_CODES.validationFailed, "Ogiltig förfrågan", "demo_request.invalid_json");
    }

    const input = normalizePayload(payload);
    if (input.website) {
      observability.logger.info("demo request honeypot accepted silently", observability.elapsed({ event: "demo_request.honeypot" }));
      return observability.correlate(NextResponse.json({ ok: true }, { headers: SUCCESS_HEADERS }));
    }
    if (input.name.length < 2 || input.company.length < 2 || !isValidEmail(input.email)) {
      return reject(400, API_ERROR_CODES.validationFailed, "Fyll i namn, giltig e-post och företag", "demo_request.validation_failed");
    }

    const ip = getClientIp(request);
    const ipLimit = await checkRateLimit(`demo-request:ip:${ip}`, 10, HOUR_MS);
    if (!ipLimit.allowed) {
      return reject(
        429,
        API_ERROR_CODES.rateLimited,
        "För många förfrågningar. Försök igen senare.",
        "demo_request.ip_rate_limited",
        { "Retry-After": String(retryAfterSeconds(ipLimit.resetAt)) },
      );
    }

    const identityLimit = await checkRateLimit(`demo-request:email:${input.email}`, 3, HOUR_MS);
    if (!identityLimit.allowed) {
      return reject(
        429,
        API_ERROR_CODES.rateLimited,
        "För många förfrågningar. Försök igen senare.",
        "demo_request.identity_rate_limited",
        { "Retry-After": String(retryAfterSeconds(identityLimit.resetAt)) },
      );
    }

    const { website: _website, ...demoRequest } = input;
    void _website;

    // Persist before contacting the email provider. The public demo form is now
    // a primary acquisition path, so a transient provider outage must never be
    // able to erase a valid lead after the visitor has submitted it.
    const lead = await db.integrationEvent.create({
      data: {
        company_id: null,
        type: "demo_request",
        status: "received",
        recipient: demoRequest.email,
        payload: {
          ...demoRequest,
          source: "public_demo_form",
          requestId: observability.requestId,
          delivery: { status: "pending" },
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    const delivery = await deliverDemoRequest(demoRequest);
    const deliverySnapshot = delivery.ok
      ? { status: "sent", providerId: delivery.providerId }
      : { status: "failed", reason: delivery.reason };

    try {
      await db.integrationEvent.update({
        where: { id: lead.id },
        data: {
          status: delivery.ok ? "sent" : "failed",
          payload: {
            ...demoRequest,
            source: "public_demo_form",
            requestId: observability.requestId,
            delivery: deliverySnapshot,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // The lead itself is already durable. Do not turn a successful capture
      // into a false client failure merely because the delivery-status journal
      // could not be updated after the external side effect.
      observability.logger.error("demo request delivery status could not be persisted", error, observability.elapsed({
        event: "demo_request.delivery_status_persist_failed",
        leadId: lead.id,
      }));
    }

    if (!delivery.ok) {
      observability.logger.error("demo request delivery deferred after durable capture", undefined, observability.elapsed({
        event: "demo_request.delivery_deferred",
        reason: delivery.reason,
        leadId: lead.id,
      }));
      return observability.correlate(NextResponse.json(
        { ok: true, deliveryPending: true },
        { status: 202, headers: SUCCESS_HEADERS },
      ));
    }

    observability.logger.info("demo request completed", observability.elapsed({
      event: "demo_request.completed",
      rateLimitSource: identityLimit.source,
      leadId: lead.id,
      hasProviderId: Boolean(delivery.providerId),
    }));
    return observability.correlate(NextResponse.json({ ok: true }, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("demo request failed", error, observability.elapsed({ event: "demo_request.failed" }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
