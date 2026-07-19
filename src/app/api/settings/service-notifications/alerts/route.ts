import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageCompany, getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const ALERT_TYPES = ["component_service_delivery_alert", "component_service_slo_alert"];
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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function acknowledgedAlertId(payload: unknown) {
  const value = stringValue(record(payload)?.alertId);
  return value.length <= 100 ? value : "";
}

function durationMinutes(from: Date, to: Date) {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageCompany(user.role)) {
    return noStore({ error: "Endast ägare och administratörer kan visa driftlarm" }, { status: 403 });
  }

  const [alerts, acknowledgements, recoveries] = await Promise.all([
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: { in: ALERT_TYPES } },
      orderBy: { created_at: "desc" },
      take: 100,
      select: { id: true, type: true, status: true, payload: true, created_at: true },
    }),
    db.integrationEvent.findMany({
      where: {
        company_id: user.company_id,
        type: "component_service_delivery_alert_acknowledgement",
        status: "acknowledged",
      },
      orderBy: { created_at: "asc" },
      take: 500,
      select: { recipient: true, payload: true, created_at: true },
    }),
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: "component_service_delivery_recovery" },
      orderBy: { created_at: "desc" },
      take: 20,
      select: { id: true, payload: true, created_at: true },
    }),
  ]);

  const currentUserAcknowledged = new Set<string>();
  const firstAcknowledgementByAlert = new Map<string, { at: Date; userId: string | null }>();

  for (const event of acknowledgements) {
    const alertId = acknowledgedAlertId(event.payload);
    if (!alertId) continue;
    if (event.recipient === user.id) currentUserAcknowledged.add(alertId);
    if (!firstAcknowledgementByAlert.has(alertId)) {
      firstAcknowledgementByAlert.set(alertId, { at: event.created_at, userId: event.recipient || null });
    }
  }

  const now = new Date();
  const items = alerts.map((event) => {
    const payload = record(event.payload);
    const severity = stringValue(payload?.severity) === "critical" ? "critical" : "warning";
    const isSlo = event.type === "component_service_slo_alert";
    const sentCount = numberValue(payload?.sentCount ?? payload?.sent);
    const failedCount = numberValue(payload?.failedCount ?? payload?.failed);
    const successRate = numberValue(payload?.successRate);
    const target = numberValue(payload?.target) || 99;
    const resolvedAt = dateValue(payload?.resolvedAt);
    const acknowledgement = firstAcknowledgementByAlert.get(event.id) || null;
    const effectiveEnd = resolvedAt || now;
    const openMinutes = durationMinutes(event.created_at, effectiveEnd);
    const acknowledgementMinutes = acknowledgement ? durationMinutes(event.created_at, acknowledgement.at) : null;
    const resolutionMinutes = resolvedAt ? durationMinutes(event.created_at, resolvedAt) : null;
    const isOpen = event.status !== "resolved";
    const acknowledgementBreached = isOpen && !acknowledgement && openMinutes > ACK_SLA_MINUTES;
    const resolutionBreached = isOpen && openMinutes > RESOLUTION_SLA_MINUTES;
    const slaSeverity = resolutionBreached && openMinutes > CRITICAL_RESOLUTION_MINUTES
      ? "critical"
      : acknowledgementBreached && openMinutes > CRITICAL_ACK_MINUTES
        ? "critical"
        : resolutionBreached || acknowledgementBreached
          ? "warning"
          : "healthy";

    return {
      id: event.id,
      kind: isSlo ? "slo" : "delivery",
      status: isOpen ? "open" : "resolved",
      severity,
      createdAt: event.created_at,
      resolvedAt,
      acknowledgedAt: acknowledgement?.at || null,
      acknowledgedBy: acknowledgement?.userId || null,
      openMinutes,
      acknowledgementMinutes,
      resolutionMinutes,
      acknowledgementBreached,
      resolutionBreached,
      slaSeverity,
      sourceEventId: stringValue(payload?.sourceEventId),
      sentCount,
      failedCount,
      acknowledged: currentUserAcknowledged.has(event.id),
      title: isSlo
        ? severity === "critical" ? "Leverans-SLO är kritiskt" : "Leverans-SLO underskrids"
        : severity === "critical" ? "Serviceaviseringar kunde inte levereras" : "Serviceaviseringar levererades delvis",
      description: isSlo
        ? `Leveransgraden är ${successRate}% mot målet ${target}% under de senaste 30 dagarna.`
        : failedCount > 0
          ? `${failedCount} leveranser misslyckades och ${sentCount} leveranser lyckades.`
          : "Leveransutfallet behöver följas upp.",
    };
  });

  const acknowledgedDurations = items
    .map((item) => item.acknowledgementMinutes)
    .filter((value): value is number => value !== null);
  const resolvedDurations = items
    .map((item) => item.resolutionMinutes)
    .filter((value): value is number => value !== null);
  const openItems = items.filter((item) => item.status === "open");
  const acknowledgementBreaches = openItems.filter((item) => item.acknowledgementBreached);
  const resolutionBreaches = openItems.filter((item) => item.resolutionBreached);
  const criticalSlaBreaches = openItems.filter((item) => item.slaSeverity === "critical");
  const slaStatus = criticalSlaBreaches.length > 0
    ? "critical"
    : acknowledgementBreaches.length > 0 || resolutionBreaches.length > 0
      ? "warning"
      : "healthy";
  const slaRecommendation = slaStatus === "critical"
    ? "Prioritera incidenterna omedelbart, utse ansvarig och dokumentera nästa återställningsåtgärd."
    : slaStatus === "warning"
      ? "Kvittera öppna larm och säkerställ att en tydlig återställningsplan finns inom SLA-fönstret."
      : "Incidenthanteringen ligger inom fastställda SLA-mål.";

  return noStore({
    alerts: items,
    recoveries: recoveries.map((event) => ({ id: event.id, createdAt: event.created_at })),
    summary: {
      total: items.length,
      open: openItems.length,
      unacknowledged: openItems.filter((item) => !item.acknowledged).length,
      critical: openItems.filter((item) => item.severity === "critical").length,
      resolved: items.filter((item) => item.status === "resolved").length,
      mttaMinutes: average(acknowledgedDurations),
      mttrMinutes: average(resolvedDurations),
      oldestOpenMinutes: openItems.length ? Math.max(...openItems.map((item) => item.openMinutes)) : 0,
      acknowledgedIncidents: acknowledgedDurations.length,
      resolvedIncidents: resolvedDurations.length,
      acknowledgementSlaMinutes: ACK_SLA_MINUTES,
      resolutionSlaMinutes: RESOLUTION_SLA_MINUTES,
      acknowledgementBreaches: acknowledgementBreaches.length,
      resolutionBreaches: resolutionBreaches.length,
      criticalSlaBreaches: criticalSlaBreaches.length,
      slaStatus,
      slaRecommendation,
    },
  });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageCompany(user.role)) {
    return noStore({ error: "Endast ägare och administratörer kan kvittera driftlarm" }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { alertId?: unknown } | null;
  const alertId = stringValue(body?.alertId);
  if (!alertId) return noStore({ error: "Driftlarmets id krävs" }, { status: 400 });

  const alert = await db.integrationEvent.findFirst({
    where: { id: alertId, company_id: user.company_id, type: { in: ALERT_TYPES } },
    select: { id: true, type: true },
  });
  if (!alert) return noStore({ error: "Driftlarmet hittades inte" }, { status: 404 });

  const existing = await db.integrationEvent.findMany({
    where: {
      company_id: user.company_id,
      type: "component_service_delivery_alert_acknowledgement",
      recipient: user.id,
      status: "acknowledged",
    },
    orderBy: { created_at: "desc" },
    take: 250,
    select: { payload: true },
  });
  if (existing.some((event) => acknowledgedAlertId(event.payload) === alertId)) {
    return noStore({ success: true, acknowledged: false });
  }

  await db.$transaction([
    db.integrationEvent.create({
      data: {
        company_id: user.company_id,
        type: "component_service_delivery_alert_acknowledgement",
        status: "acknowledged",
        recipient: user.id,
        payload: { alertId, alertType: alert.type },
      },
    }),
    db.auditLog.create({
      data: {
        company_id: user.company_id,
        actor_user_id: user.id,
        entity_type: alert.type === "component_service_slo_alert" ? "service_notification_slo_alert" : "service_notification_delivery_alert",
        entity_id: alertId,
        action: alert.type === "component_service_slo_alert" ? "component_service_slo.acknowledged" : "component_service_delivery_alert.acknowledged",
        metadata: { alertId, alertType: alert.type },
      },
    }),
  ]);

  return noStore({ success: true, acknowledged: true });
}
