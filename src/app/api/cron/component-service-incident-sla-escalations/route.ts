import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALERT_TYPES = ["component_service_delivery_alert", "component_service_slo_alert"];
const ESCALATION_TYPE = "component_service_incident_sla_escalation";
const ACK_TYPE = "component_service_delivery_alert_acknowledgement";
const ACK_SLA_MINUTES = 30;
const RESOLUTION_SLA_MINUTES = 24 * 60;
const CRITICAL_ACK_MINUTES = 2 * 60;
const CRITICAL_RESOLUTION_MINUTES = 48 * 60;

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

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function minutesSince(value: Date, now: Date) {
  return Math.max(0, Math.round((now.getTime() - value.getTime()) / 60_000));
}

function escalationKey(alertId: string, breachType: string) {
  return `${alertId}:${breachType}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return noStore({ error: "Obehörig" }, { status: 401 });

  const now = new Date();
  const [alerts, acknowledgements, existingEscalations] = await Promise.all([
    db.integrationEvent.findMany({
      where: { type: { in: ALERT_TYPES }, status: "open", company_id: { not: null } },
      select: { id: true, company_id: true, type: true, created_at: true, payload: true },
    }),
    db.integrationEvent.findMany({
      where: { type: ACK_TYPE, status: "acknowledged", company_id: { not: null } },
      orderBy: { created_at: "asc" },
      select: { company_id: true, payload: true, created_at: true },
    }),
    db.integrationEvent.findMany({
      where: { type: ESCALATION_TYPE, status: "open", company_id: { not: null } },
      select: { id: true, company_id: true, payload: true },
    }),
  ]);

  const acknowledged = new Set<string>();
  for (const event of acknowledgements) {
    const alertId = stringValue(record(event.payload)?.alertId);
    if (event.company_id && alertId) acknowledged.add(`${event.company_id}:${alertId}`);
  }

  const existingByKey = new Map<string, typeof existingEscalations[number]>();
  for (const event of existingEscalations) {
    const payload = record(event.payload);
    const alertId = stringValue(payload?.alertId);
    const breachType = stringValue(payload?.breachType);
    if (event.company_id && alertId && breachType) {
      existingByKey.set(`${event.company_id}:${escalationKey(alertId, breachType)}`, event);
    }
  }

  const activeKeys = new Set<string>();
  const result = { scanned: alerts.length, opened: 0, updated: 0, resolved: 0, healthy: 0 };

  for (const alert of alerts) {
    if (!alert.company_id) continue;
    const openMinutes = minutesSince(alert.created_at, now);
    const isAcknowledged = acknowledged.has(`${alert.company_id}:${alert.id}`);
    const desired: Array<{ breachType: "acknowledgement" | "resolution"; severity: "warning" | "critical"; thresholdMinutes: number }> = [];

    if (!isAcknowledged && openMinutes > ACK_SLA_MINUTES) {
      desired.push({
        breachType: "acknowledgement",
        severity: openMinutes > CRITICAL_ACK_MINUTES ? "critical" : "warning",
        thresholdMinutes: ACK_SLA_MINUTES,
      });
    }
    if (openMinutes > RESOLUTION_SLA_MINUTES) {
      desired.push({
        breachType: "resolution",
        severity: openMinutes > CRITICAL_RESOLUTION_MINUTES ? "critical" : "warning",
        thresholdMinutes: RESOLUTION_SLA_MINUTES,
      });
    }

    if (!desired.length) result.healthy += 1;

    for (const breach of desired) {
      const key = `${alert.company_id}:${escalationKey(alert.id, breach.breachType)}`;
      activeKeys.add(key);
      const snapshot = {
        alertId: alert.id,
        alertType: alert.type,
        breachType: breach.breachType,
        severity: breach.severity,
        thresholdMinutes: breach.thresholdMinutes,
        openMinutes,
        acknowledged: isAcknowledged,
        evaluatedAt: now.toISOString(),
      };
      const existing = existingByKey.get(key);

      if (existing) {
        await db.integrationEvent.update({
          where: { id: existing.id },
          data: { payload: toJson({ ...record(existing.payload), ...snapshot, lastObservedAt: now.toISOString() }) },
        });
        result.updated += 1;
      } else {
        const created = await db.integrationEvent.create({
          data: {
            company_id: alert.company_id,
            type: ESCALATION_TYPE,
            status: "open",
            recipient: "service-notification-operations",
            payload: toJson({ ...snapshot, openedAt: now.toISOString() }),
          },
        });
        await db.auditLog.create({
          data: {
            company_id: alert.company_id,
            actor_user_id: null,
            entity_type: "service_notification_incident_sla_escalation",
            entity_id: created.id,
            action: `component_service_incident_sla.${breach.breachType}.${breach.severity}`,
            metadata: toJson(snapshot),
          },
        });
        result.opened += 1;
      }
    }
  }

  for (const escalation of existingEscalations) {
    if (!escalation.company_id) continue;
    const payload = record(escalation.payload);
    const alertId = stringValue(payload?.alertId);
    const breachType = stringValue(payload?.breachType);
    const key = `${escalation.company_id}:${escalationKey(alertId, breachType)}`;
    if (activeKeys.has(key)) continue;

    await db.$transaction([
      db.integrationEvent.update({
        where: { id: escalation.id },
        data: {
          status: "resolved",
          payload: toJson({ ...payload, resolvedAt: now.toISOString(), resolvedReason: "sla_recovered" }),
        },
      }),
      db.auditLog.create({
        data: {
          company_id: escalation.company_id,
          actor_user_id: null,
          entity_type: "service_notification_incident_sla_escalation",
          entity_id: escalation.id,
          action: "component_service_incident_sla.resolved",
          metadata: toJson({ alertId, breachType, resolvedAt: now.toISOString() }),
        },
      }),
    ]);
    result.resolved += 1;
  }

  return noStore(result);
}
