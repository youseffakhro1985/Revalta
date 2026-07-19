import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageCompany, getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const SLO_TARGET = 99;
const SLO_WARNING = 97;
const SLO_CRITICAL = 95;

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init?.headers || {}) },
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stockholmDay(value: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function sloStatus(successRate: number, deliveries: number, retryExhausted: number, permanentFailures: number) {
  if (!deliveries) return "no_data" as const;
  if (successRate < SLO_CRITICAL || permanentFailures > 0) return "critical" as const;
  if (successRate < SLO_TARGET || retryExhausted > 0) return "warning" as const;
  return "healthy" as const;
}

function sloRecommendation(status: "no_data" | "healthy" | "warning" | "critical", retryExhausted: number, permanentFailures: number) {
  if (status === "no_data") return "Ingen leveranshistorik finns ännu. Kör en avisering för att börja mäta SLO.";
  if (status === "healthy") return "Leveransmålet uppfylls. Fortsätt följa trend och provider-failover.";
  if (permanentFailures > 0) return "Åtgärda permanenta fel först: kontrollera mottagare, verifierad avsändardomän och providerbehörigheter.";
  if (retryExhausted > 0) return "Granska uttömda återförsök och säkerställ att reservprovidern är konfigurerad.";
  return "Leveransgraden ligger under målet. Granska senaste körningar och providerfel innan nästa utskick.";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageCompany(user.role)) {
    return noStore({ error: "Endast ägare och administratörer kan visa leveransmått" }, { status: 403 });
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await db.integrationEvent.findMany({
    where: {
      company_id: user.company_id,
      type: "component_service_digest",
      created_at: { gte: since },
      status: { in: ["sent", "partial", "failed"] },
    },
    orderBy: { created_at: "desc" },
    take: 250,
    select: { id: true, status: true, payload: true, created_at: true },
  });

  let deliveries = 0;
  let sent = 0;
  let failed = 0;
  let retryRecovered = 0;
  let retryExhausted = 0;
  let permanentFailures = 0;
  let totalAttempts = 0;

  const daily = new Map<string, { date: string; sent: number; failed: number; retried: number }>();

  for (const event of events) {
    const payload = record(event.payload);
    const eventDeliveries = array(payload?.deliveries);
    const date = stockholmDay(event.created_at);
    const bucket = daily.get(date) || { date, sent: 0, failed: 0, retried: 0 };

    for (const rawDelivery of eventDeliveries) {
      const delivery = record(rawDelivery);
      if (!delivery) continue;
      const status = stringValue(delivery.status);
      const attempts = Math.max(0, numberValue(delivery.attempts));
      const retryable = delivery.retryable === true;

      deliveries += 1;
      totalAttempts += attempts;
      if (status === "sent") {
        sent += 1;
        bucket.sent += 1;
        if (attempts > 1) {
          retryRecovered += 1;
          bucket.retried += 1;
        }
      } else {
        failed += 1;
        bucket.failed += 1;
        if (retryable) retryExhausted += 1;
        else permanentFailures += 1;
      }
    }

    daily.set(date, bucket);
  }

  const successRate = deliveries ? Math.round((sent / deliveries) * 1000) / 10 : 100;
  const retryRate = deliveries ? Math.round((retryRecovered / deliveries) * 1000) / 10 : 0;
  const averageAttempts = deliveries ? Math.round((totalAttempts / deliveries) * 100) / 100 : 0;
  const status = sloStatus(successRate, deliveries, retryExhausted, permanentFailures);
  const budgetCapacity = deliveries * ((100 - SLO_TARGET) / 100);
  const budgetConsumedPercent = deliveries
    ? Math.min(999, Math.round((failed / Math.max(budgetCapacity, 0.01)) * 1000) / 10)
    : 0;

  return noStore({
    periodDays: 30,
    generatedAt: new Date(),
    slo: {
      target: SLO_TARGET,
      warningThreshold: SLO_WARNING,
      criticalThreshold: SLO_CRITICAL,
      status,
      budgetConsumedPercent,
      budgetRemainingPercent: Math.max(0, Math.round((100 - budgetConsumedPercent) * 10) / 10),
      recommendation: sloRecommendation(status, retryExhausted, permanentFailures),
    },
    summary: {
      runs: events.length,
      deliveries,
      sent,
      failed,
      successRate,
      retryRate,
      averageAttempts,
      retryRecovered,
      retryExhausted,
      permanentFailures,
    },
    trend: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-14),
    recentRuns: events.slice(0, 8).map((event) => {
      const payload = record(event.payload);
      const summary = record(payload?.deliverySummary);
      return {
        id: event.id,
        createdAt: event.created_at,
        status: event.status,
        total: numberValue(summary?.total),
        sent: numberValue(summary?.sent),
        failed: numberValue(summary?.failed),
      };
    }),
  });
}
