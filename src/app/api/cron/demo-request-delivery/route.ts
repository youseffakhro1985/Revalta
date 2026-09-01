import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import {
  deliverDemoRequest,
  type DemoDeliveryFailureReason,
  type DemoRequest,
} from "@/lib/demo-request-email";
import { isCronRequestAuthorized } from "@/lib/request-security";
import { createRouteObservability } from "@/lib/route-observability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/cron/demo-request-delivery";
const MAX_CANDIDATES_PER_RUN = 50;
const MAX_RETRY_ATTEMPTS = 14;
const SAFE_RETRY_REASONS = new Set<DemoDeliveryFailureReason>([
  "not_configured",
  "provider_rejected",
]);
const SUCCESS_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

type Obj = Record<string, unknown>;

type RetrySnapshot = {
  attempts: number;
  lastAttemptAt: string | null;
  previousReason: string | null;
};

function object(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function retrySnapshot(payload: Obj): RetrySnapshot {
  const retry = object(payload.retry);
  const attempts = Number(retry?.attempts);
  return {
    attempts: Number.isSafeInteger(attempts) && attempts >= 0 ? attempts : 0,
    lastAttemptAt: text(retry?.lastAttemptAt) || null,
    previousReason: text(retry?.previousReason) || null,
  };
}

function deliveryReason(payload: Obj) {
  const delivery = object(payload.delivery);
  return text(delivery?.reason) || null;
}

function demoRequestFromPayload(payload: Obj): DemoRequest | null {
  const request: DemoRequest = {
    name: text(payload.name),
    email: text(payload.email),
    company: text(payload.company),
    phone: text(payload.phone),
    role: text(payload.role),
    portfolio: text(payload.portfolio),
    message: text(payload.message),
  };
  if (request.name.length < 2 || request.company.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email)) {
    return null;
  }
  return request;
}

function withRetry(payload: Obj, retry: RetrySnapshot, extra: Obj = {}) {
  return {
    ...payload,
    ...extra,
    retry,
  } as Prisma.InputJsonValue;
}

async function transition(
  id: string,
  fromStatus: string,
  toStatus: string,
  payload: Prisma.InputJsonValue,
) {
  return db.integrationEvent.updateMany({
    where: { id, company_id: null, type: "demo_request", status: fromStatus },
    data: { status: toStatus, payload },
  });
}

async function execute(observability: ReturnType<typeof createRouteObservability>) {
  const candidates = await db.integrationEvent.findMany({
    where: { company_id: null, type: "demo_request", status: "failed" },
    orderBy: { created_at: "asc" },
    take: MAX_CANDIDATES_PER_RUN,
    select: { id: true, payload: true },
  });

  const result = {
    candidates: candidates.length,
    sent: 0,
    retryableFailed: 0,
    reconciliationRequired: 0,
    exhausted: 0,
    invalid: 0,
    skipped: 0,
  };

  for (const candidate of candidates) {
    const payload = object(candidate.payload);
    if (!payload) {
      const marked = await transition(candidate.id, "failed", "invalid", { error: "invalid_demo_request_payload" });
      marked.count ? result.invalid += 1 : result.skipped += 1;
      continue;
    }

    const request = demoRequestFromPayload(payload);
    if (!request) {
      const marked = await transition(
        candidate.id,
        "failed",
        "invalid",
        withRetry(payload, retrySnapshot(payload), { delivery: { status: "invalid" } }),
      );
      marked.count ? result.invalid += 1 : result.skipped += 1;
      continue;
    }

    const previousReason = deliveryReason(payload);
    const retry = retrySnapshot(payload);
    if (!previousReason || !SAFE_RETRY_REASONS.has(previousReason as DemoDeliveryFailureReason)) {
      const marked = await transition(
        candidate.id,
        "failed",
        "reconciliation_required",
        withRetry(payload, retry, {
          delivery: {
            ...(object(payload.delivery) ?? {}),
            status: "reconciliation_required",
            reason: previousReason || "unknown_failure",
          },
        }),
      );
      marked.count ? result.reconciliationRequired += 1 : result.skipped += 1;
      continue;
    }

    if (retry.attempts >= MAX_RETRY_ATTEMPTS) {
      const marked = await transition(
        candidate.id,
        "failed",
        "retry_exhausted",
        withRetry(payload, retry, {
          delivery: {
            ...(object(payload.delivery) ?? {}),
            status: "retry_exhausted",
          },
        }),
      );
      marked.count ? result.exhausted += 1 : result.skipped += 1;
      continue;
    }

    const nextRetry: RetrySnapshot = {
      attempts: retry.attempts + 1,
      lastAttemptAt: new Date().toISOString(),
      previousReason,
    };
    const claim = await transition(
      candidate.id,
      "failed",
      "processing",
      withRetry(payload, nextRetry, {
        delivery: {
          ...(object(payload.delivery) ?? {}),
          status: "processing",
        },
      }),
    );
    if (claim.count === 0) {
      result.skipped += 1;
      continue;
    }

    let providerAccepted = false;
    try {
      const delivery = await deliverDemoRequest(request, {
        idempotencyKey: `demo-request/${candidate.id}`,
      });

      if (delivery.ok) {
        providerAccepted = true;
        const receipt = await transition(
          candidate.id,
          "processing",
          "sent",
          withRetry(payload, nextRetry, {
            delivery: { status: "sent", providerId: delivery.providerId },
          }),
        );
        if (receipt.count === 0) {
          result.reconciliationRequired += 1;
          observability.logger.error("demo lead retry requires reconciliation after provider success", undefined, {
            event: "cron.demo_request_delivery.reconciliation_required",
            leadId: candidate.id,
            attempt: nextRetry.attempts,
          });
          continue;
        }
        result.sent += 1;
        continue;
      }

      if (SAFE_RETRY_REASONS.has(delivery.reason)) {
        const failed = await transition(
          candidate.id,
          "processing",
          "failed",
          withRetry(payload, nextRetry, {
            delivery: { status: "failed", reason: delivery.reason },
          }),
        );
        if (failed.count === 0) {
          result.reconciliationRequired += 1;
          observability.logger.error("demo lead retry failure state could not be persisted", undefined, {
            event: "cron.demo_request_delivery.failure_state_missing",
            leadId: candidate.id,
            attempt: nextRetry.attempts,
            reason: delivery.reason,
          });
          continue;
        }
        result.retryableFailed += 1;
        continue;
      }

      const ambiguous = await transition(
        candidate.id,
        "processing",
        "reconciliation_required",
        withRetry(payload, nextRetry, {
          delivery: { status: "reconciliation_required", reason: delivery.reason },
        }),
      );
      if (ambiguous.count === 0) {
        observability.logger.error("demo lead ambiguous delivery state could not be persisted", undefined, {
          event: "cron.demo_request_delivery.ambiguous_state_missing",
          leadId: candidate.id,
          attempt: nextRetry.attempts,
          reason: delivery.reason,
        });
      }
      result.reconciliationRequired += 1;
    } catch (error) {
      // deliverDemoRequest normally returns a classified failure instead of
      // throwing. Any unexpected error after claim is therefore treated as
      // ambiguous and the row remains processing so no future run can resend it.
      observability.logger.error("demo lead retry failed unexpectedly", error, {
        event: providerAccepted
          ? "cron.demo_request_delivery.receipt_failure_after_provider_success"
          : "cron.demo_request_delivery.unexpected_failure",
        leadId: candidate.id,
        attempt: nextRetry.attempts,
      });
      result.reconciliationRequired += 1;
    }
  }

  return result;
}

export async function GET(request: Request) {
  const observability = createRouteObservability(request, ROUTE);
  if (!isCronRequestAuthorized(request)) {
    observability.logger.warn("demo request delivery cron rejected", observability.elapsed({
      event: "cron.demo_request_delivery.unauthorized",
    }));
    return apiErrorResponse({
      status: 401,
      code: API_ERROR_CODES.unauthorized,
      message: "Obehörig",
      requestId: observability.requestId,
    });
  }

  try {
    const result = await execute(observability);
    observability.logger.info("demo request delivery cron completed", observability.elapsed({
      event: "cron.demo_request_delivery.completed",
      ...result,
    }));
    return observability.correlate(NextResponse.json(result, { headers: SUCCESS_HEADERS }));
  } catch (error) {
    observability.logger.error("demo request delivery cron failed", error, observability.elapsed({
      event: "cron.demo_request_delivery.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
