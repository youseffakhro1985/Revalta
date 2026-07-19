import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageCompany, getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const PROCESSING_STALE_MS = 15 * 60_000;
const HISTORY_LIMIT = 30;

type DeliverySummary = {
  total: number;
  sent: number;
  failed: number;
};

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

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function deliverySummary(payload: unknown): DeliverySummary {
  const summary = record(record(payload)?.deliverySummary);
  return {
    total: numberValue(summary?.total),
    sent: numberValue(summary?.sent),
    failed: numberValue(summary?.failed),
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageCompany(user.role)) {
    return noStore({ error: "Endast ägare och administratörer kan visa leveranshälsan" }, { status: 403 });
  }

  const events = await db.integrationEvent.findMany({
    where: {
      company_id: user.company_id,
      type: "component_service_digest",
    },
    orderBy: { created_at: "desc" },
    take: HISTORY_LIMIT,
    select: {
      id: true,
      status: true,
      payload: true,
      created_at: true,
    },
  });

  const now = Date.now();
  const latest = events[0] ?? null;
  const latestSuccessful = events.find((event) => event.status === "sent") ?? null;
  const staleProcessing = events.filter(
    (event) => event.status === "processing" && now - event.created_at.getTime() > PROCESSING_STALE_MS,
  );

  let consecutiveFailures = 0;
  for (const event of events) {
    if (event.status === "failed" || event.status === "partial") {
      consecutiveFailures += 1;
      continue;
    }
    if (event.status === "processing" && now - event.created_at.getTime() > PROCESSING_STALE_MS) {
      consecutiveFailures += 1;
      continue;
    }
    break;
  }

  const totals = events.reduce(
    (summary, event) => {
      const delivery = deliverySummary(event.payload);
      summary.runs += 1;
      summary.deliveries += delivery.total;
      summary.sent += delivery.sent;
      summary.failed += delivery.failed;
      summary.statuses[event.status] = (summary.statuses[event.status] || 0) + 1;
      return summary;
    },
    {
      runs: 0,
      deliveries: 0,
      sent: 0,
      failed: 0,
      statuses: {} as Record<string, number>,
    },
  );

  const configurationReady = Boolean(
    process.env.CRON_SECRET && process.env.EMAIL_PROVIDER_API_KEY && process.env.EMAIL_FROM,
  );

  const health = !configurationReady
    ? "critical"
    : staleProcessing.length > 0 || consecutiveFailures >= 3
      ? "critical"
      : consecutiveFailures > 0 || latest?.status === "partial"
        ? "degraded"
        : latest
          ? "healthy"
          : "idle";

  return noStore({
    health,
    generatedAt: new Date(now),
    configurationReady,
    latestRun: latest
      ? {
          id: latest.id,
          status: latest.status,
          createdAt: latest.created_at,
          deliverySummary: deliverySummary(latest.payload),
        }
      : null,
    latestSuccessfulRun: latestSuccessful
      ? {
          id: latestSuccessful.id,
          createdAt: latestSuccessful.created_at,
          deliverySummary: deliverySummary(latestSuccessful.payload),
        }
      : null,
    consecutiveFailures,
    staleProcessing: staleProcessing.map((event) => ({
      id: event.id,
      createdAt: event.created_at,
      ageMinutes: Math.floor((now - event.created_at.getTime()) / 60_000),
    })),
    history: totals,
  });
}
