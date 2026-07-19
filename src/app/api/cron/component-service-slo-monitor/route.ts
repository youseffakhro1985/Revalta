import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PERIOD_DAYS = 30;
const SLO_TARGET = 99;
const CRITICAL_THRESHOLD = 95;
const ALERT_TYPE = "component_service_slo_alert";

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

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

type CompanySummary = {
  deliveries: number;
  sent: number;
  failed: number;
  permanentFailures: number;
};

export async function GET(request: Request) {
  if (!authorized(request)) return noStore({ error: "Obehörig" }, { status: 401 });

  const since = new Date(Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const companies = await db.company.findMany({
    where: { status: "active" },
    select: { id: true },
  });
  const events = await db.integrationEvent.findMany({
    where: {
      company_id: { in: companies.map((company) => company.id) },
      type: "component_service_digest",
      created_at: { gte: since },
      status: { in: ["sent", "partial", "failed"] },
    },
    select: { company_id: true, payload: true },
  });
  const openAlerts = await db.integrationEvent.findMany({
    where: {
      company_id: { in: companies.map((company) => company.id) },
      type: ALERT_TYPE,
      status: "open",
    },
    orderBy: { created_at: "desc" },
    select: { id: true, company_id: true, payload: true },
  });

  const summaries = new Map<string, CompanySummary>();
  for (const company of companies) {
    summaries.set(company.id, { deliveries: 0, sent: 0, failed: 0, permanentFailures: 0 });
  }
  for (const event of events) {
    if (!event.company_id) continue;
    const summary = summaries.get(event.company_id);
    if (!summary) continue;
    const payload = record(event.payload);
    for (const rawDelivery of array(payload?.deliveries)) {
      const delivery = record(rawDelivery);
      if (!delivery) continue;
      summary.deliveries += 1;
      if (delivery.status === "sent") summary.sent += 1;
      else {
        summary.failed += 1;
        if (delivery.retryable !== true) summary.permanentFailures += 1;
      }
    }
  }

  const alertsByCompany = new Map<string, typeof openAlerts[number]>();
  for (const alert of openAlerts) {
    if (alert.company_id && !alertsByCompany.has(alert.company_id)) alertsByCompany.set(alert.company_id, alert);
  }

  const result = { scanned: companies.length, opened: 0, updated: 0, resolved: 0, healthy: 0, noData: 0 };

  for (const company of companies) {
    const summary = summaries.get(company.id)!;
    const currentAlert = alertsByCompany.get(company.id);
    const successRate = summary.deliveries
      ? Math.round((summary.sent / summary.deliveries) * 1000) / 10
      : 100;
    const severity = summary.deliveries === 0
      ? "no_data"
      : successRate < CRITICAL_THRESHOLD || summary.permanentFailures > 0
        ? "critical"
        : successRate < SLO_TARGET
          ? "warning"
          : "healthy";
    const snapshot = {
      periodDays: PERIOD_DAYS,
      target: SLO_TARGET,
      criticalThreshold: CRITICAL_THRESHOLD,
      severity,
      successRate,
      ...summary,
      evaluatedAt: new Date().toISOString(),
    };

    if (severity === "warning" || severity === "critical") {
      if (currentAlert) {
        await db.integrationEvent.update({
          where: { id: currentAlert.id },
          data: { payload: toJson({ ...record(currentAlert.payload), ...snapshot, lastObservedAt: new Date().toISOString() }) },
        });
        result.updated += 1;
      } else {
        const created = await db.integrationEvent.create({
          data: {
            company_id: company.id,
            type: ALERT_TYPE,
            status: "open",
            recipient: "service-notification-operations",
            payload: toJson({ ...snapshot, openedAt: new Date().toISOString() }),
          },
        });
        await db.auditLog.create({
          data: {
            company_id: company.id,
            actor_user_id: null,
            entity_type: "service_notification_slo",
            entity_id: created.id,
            action: `component_service_slo.${severity}`,
            metadata: toJson(snapshot),
          },
        });
        result.opened += 1;
      }
      continue;
    }

    if (currentAlert) {
      await db.$transaction([
        db.integrationEvent.update({
          where: { id: currentAlert.id },
          data: { status: "resolved", payload: toJson({ ...record(currentAlert.payload), ...snapshot, resolvedAt: new Date().toISOString(), resolvedReason: severity === "no_data" ? "no_recent_deliveries" : "slo_recovered" }) },
        }),
        db.auditLog.create({
          data: {
            company_id: company.id,
            actor_user_id: null,
            entity_type: "service_notification_slo",
            entity_id: currentAlert.id,
            action: "component_service_slo.resolved",
            metadata: toJson(snapshot),
          },
        }),
      ]);
      result.resolved += 1;
    } else if (severity === "no_data") result.noData += 1;
    else result.healthy += 1;
  }

  return noStore(result);
}
