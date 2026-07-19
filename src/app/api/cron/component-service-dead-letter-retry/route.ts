import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { deliverServiceEmail } from "@/lib/component-service-email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DueComponent = {
  id: string;
  property_id: string;
  component_name: string;
  next_service_at: Date;
  property_name: string;
  property_address: string;
  property_city: string;
};

const MAX_AUTO_RETRIES = 3;
const RETRY_DELAYS_MS = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
const PROCESSING_LEASE_MS = 10 * 60_000;

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init?.headers || {}) },
  });
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function dateValue(value: unknown) {
  const valueText = text(value);
  if (!valueText) return null;
  const date = new Date(valueText);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function claim(eventId: string) {
  return db.$transaction(async (tx) => {
    const current = await tx.integrationEvent.findUnique({
      where: { id: eventId },
      select: { status: true, payload: true },
    });
    if (!current || current.status !== "open") return null;

    const payload = record(current.payload) || {};
    const processingAt = dateValue(payload.autoRetryProcessingAt);
    if (processingAt && processingAt.getTime() > Date.now() - PROCESSING_LEASE_MS) return null;

    const nextPayload = {
      ...payload,
      autoRetryProcessingAt: new Date().toISOString(),
    };
    await tx.integrationEvent.update({
      where: { id: eventId },
      data: { status: "processing", payload: toJson(nextPayload) },
    });
    return nextPayload;
  });
}

async function currentComponents(companyId: string, mode: "all" | "overdue_only", daysAhead: number) {
  const now = new Date();
  const dueBefore = mode === "overdue_only"
    ? now
    : new Date(now.getTime() + daysAhead * 86400000);

  return db.$queryRaw<DueComponent[]>(Prisma.sql`
    SELECT a."id", a."property_id", a."name" AS "component_name", a."next_service_at",
      p."name" AS "property_name", p."address" AS "property_address", p."city" AS "property_city"
    FROM "PropertyTechnicalAsset" a
    INNER JOIN "Property" p ON p."id" = a."property_id" AND p."company_id" = a."company_id"
    WHERE a."company_id" = ${companyId}
      AND a."next_service_at" IS NOT NULL
      AND a."next_service_at" <= ${dueBefore}
      AND COALESCE(a."status", 'active') NOT IN ('retired', 'removed')
    ORDER BY a."next_service_at" ASC
  `);
}

export async function GET(request: Request) {
  if (!authorized(request)) return noStore({ error: "Obehörig" }, { status: 401 });

  const candidates = await db.integrationEvent.findMany({
    where: {
      type: "component_service_dead_letter",
      status: "open",
      company_id: { not: null },
    },
    orderBy: { created_at: "asc" },
    take: 50,
    select: { id: true, company_id: true, payload: true },
  });

  const result = {
    scanned: candidates.length,
    eligible: 0,
    resolved: 0,
    deferred: 0,
    escalated: 0,
    failed: 0,
    skipped: 0,
  };

  for (const candidate of candidates) {
    if (!candidate.company_id) continue;
    const original = record(candidate.payload) || {};
    const autoRetryCount = Math.max(0, numberValue(original.autoRetryCount));
    const nextRetryAt = dateValue(original.nextAutoRetryAt);

    if (original.retryable !== true || original.autoRetryExhausted === true) {
      result.skipped += 1;
      continue;
    }
    if (autoRetryCount >= MAX_AUTO_RETRIES) {
      result.skipped += 1;
      continue;
    }
    if (nextRetryAt && nextRetryAt.getTime() > Date.now()) {
      result.deferred += 1;
      continue;
    }

    result.eligible += 1;
    const claimedPayload = await claim(candidate.id);
    if (!claimedPayload) {
      result.skipped += 1;
      continue;
    }

    const email = text(claimedPayload.email).toLowerCase();
    const mode = claimedPayload.mode === "overdue_only" ? "overdue_only" : "all";
    const daysAhead = Math.min(90, Math.max(1, numberValue(claimedPayload.daysAhead, 30)));
    const attemptNumber = Math.max(0, numberValue(claimedPayload.autoRetryCount)) + 1;

    if (!email) {
      await db.integrationEvent.update({
        where: { id: candidate.id },
        data: {
          status: "open",
          payload: toJson({
            ...claimedPayload,
            autoRetryProcessingAt: null,
            autoRetryExhausted: true,
            escalationReason: "missing_recipient",
            escalatedAt: new Date().toISOString(),
          }),
        },
      });
      result.escalated += 1;
      continue;
    }

    const components = await currentComponents(candidate.company_id, mode, daysAhead);
    if (!components.length) {
      await db.$transaction([
        db.integrationEvent.update({
          where: { id: candidate.id },
          data: {
            status: "resolved",
            payload: toJson({
              ...claimedPayload,
              autoRetryProcessingAt: null,
              resolvedAt: new Date().toISOString(),
              resolvedReason: "no_current_components",
            }),
          },
        }),
        db.auditLog.create({
          data: {
            company_id: candidate.company_id,
            actor_user_id: null,
            entity_type: "service_notification_dead_letter",
            entity_id: candidate.id,
            action: "component_service_dead_letter.auto_resolved_without_delivery",
            metadata: toJson({ email, mode }),
          },
        }),
      ]);
      result.resolved += 1;
      continue;
    }

    const delivery = await deliverServiceEmail(email, components, daysAhead, mode);
    if (delivery.status === "sent") {
      await db.$transaction([
        db.integrationEvent.update({
          where: { id: candidate.id },
          data: {
            status: "resolved",
            payload: toJson({
              ...claimedPayload,
              autoRetryProcessingAt: null,
              autoRetryCount: attemptNumber,
              lastAutoRetryAt: new Date().toISOString(),
              lastAutoRetryResult: delivery,
              resolvedAt: new Date().toISOString(),
              resolvedReason: "automatic_retry_succeeded",
            }),
          },
        }),
        db.auditLog.create({
          data: {
            company_id: candidate.company_id,
            actor_user_id: null,
            entity_type: "service_notification_dead_letter",
            entity_id: candidate.id,
            action: "component_service_dead_letter.auto_resolved",
            metadata: toJson({ email, mode, autoRetryCount: attemptNumber, attempts: delivery.attempts }),
          },
        }),
      ]);
      result.resolved += 1;
      continue;
    }

    const exhausted = attemptNumber >= MAX_AUTO_RETRIES || delivery.retryable !== true;
    const nextDelay = RETRY_DELAYS_MS[Math.min(attemptNumber, RETRY_DELAYS_MS.length) - 1];
    const nextAutoRetryAt = exhausted ? null : new Date(Date.now() + nextDelay).toISOString();
    const nextPayload = {
      ...claimedPayload,
      autoRetryProcessingAt: null,
      autoRetryCount: attemptNumber,
      lastAutoRetryAt: new Date().toISOString(),
      lastAutoRetryResult: delivery,
      error: delivery.error,
      attempts: delivery.attempts,
      retryable: delivery.retryable,
      nextAutoRetryAt,
      autoRetryExhausted: exhausted,
      escalatedAt: exhausted ? new Date().toISOString() : null,
      escalationReason: exhausted
        ? delivery.retryable === true ? "automatic_retry_limit_reached" : "permanent_delivery_error"
        : null,
    };

    const operations = [
      db.integrationEvent.update({
        where: { id: candidate.id },
        data: { status: "open", payload: toJson(nextPayload) },
      }),
      db.auditLog.create({
        data: {
          company_id: candidate.company_id,
          actor_user_id: null,
          entity_type: "service_notification_dead_letter",
          entity_id: candidate.id,
          action: exhausted
            ? "component_service_dead_letter.auto_retry_escalated"
            : "component_service_dead_letter.auto_retry_failed",
          metadata: toJson({
            email,
            mode,
            autoRetryCount: attemptNumber,
            attempts: delivery.attempts,
            nextAutoRetryAt,
            error: delivery.error,
          }),
        },
      }),
    ];

    if (exhausted) {
      operations.push(db.integrationEvent.create({
        data: {
          company_id: candidate.company_id,
          type: "component_service_dead_letter_escalation",
          status: "open",
          recipient: candidate.id,
          payload: toJson({
            deadLetterId: candidate.id,
            sourceEventId: text(claimedPayload.sourceEventId),
            email,
            mode,
            autoRetryCount: attemptNumber,
            reason: nextPayload.escalationReason,
            error: delivery.error,
          }),
        },
      }));
    }

    await db.$transaction(operations);
    if (exhausted) result.escalated += 1;
    else result.failed += 1;
  }

  return noStore(result);
}
