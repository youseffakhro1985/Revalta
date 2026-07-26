import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageCompany, getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

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

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return noStore({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return noStore({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageCompany(user.role)) {
    return noStore({ error: "Endast ägare och administratörer kan visa driftlarm" }, { status: 403 });
  }

  const [modernAlerts, legacyAlerts, modernAcks, legacyAcks, recoveries] = await Promise.all([
    db.componentServiceDeliveryAlert.findMany({
      where: { company_id: user.company_id },
      orderBy: { created_at: "desc" },
      take: 50,
    }),
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: "component_service_delivery_alert" },
      orderBy: { created_at: "desc" },
      take: 50,
      select: { id: true, status: true, payload: true, created_at: true },
    }),
    db.componentServiceDeliveryAlertAck.findMany({
      where: { company_id: user.company_id, user_id: user.id },
      select: { alert_id: true },
      take: 200,
    }),
    db.integrationEvent.findMany({
      where: {
        company_id: user.company_id,
        type: "component_service_delivery_alert_acknowledgement",
        recipient: user.id,
        status: "acknowledged",
      },
      orderBy: { created_at: "desc" },
      take: 200,
      select: { payload: true },
    }),
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: "component_service_delivery_recovery" },
      orderBy: { created_at: "desc" },
      take: 20,
      select: { id: true, payload: true, created_at: true },
    }),
  ]);

  const acknowledged = new Set<string>([
    ...modernAcks.map((ack) => ack.alert_id),
    ...legacyAcks
      .map((event) => stringValue(record(event.payload)?.alertId))
      .filter((value) => value.length > 0 && value.length <= 100),
  ]);

  const byId = new Map<string, {
    id: string;
    status: string;
    severity: string;
    createdAt: Date;
    sourceEventId: string;
    sentCount: number;
    failedCount: number;
    acknowledged: boolean;
    title: string;
    description: string;
  }>();

  for (const alert of modernAlerts) {
    const severity = alert.severity === "critical" ? "critical" : "warning";
    byId.set(alert.id, {
      id: alert.id,
      status: alert.status === "resolved" ? "resolved" : "open",
      severity,
      createdAt: alert.created_at,
      sourceEventId: alert.source_run_id || "",
      sentCount: alert.sent_count,
      failedCount: alert.failed_count,
      acknowledged: acknowledged.has(alert.id),
      title: severity === "critical" ? "Serviceaviseringar kunde inte levereras" : "Serviceaviseringar levererades delvis",
      description: alert.failed_count > 0
        ? `${alert.failed_count} leveranser misslyckades och ${alert.sent_count} leveranser lyckades.`
        : "Leveransutfallet behöver följas upp.",
    });
  }

  for (const event of legacyAlerts) {
    if (byId.has(event.id)) continue;
    const payload = record(event.payload);
    const severity = stringValue(payload?.severity) === "critical" ? "critical" : "warning";
    const sentCount = numberValue(payload?.sentCount);
    const failedCount = numberValue(payload?.failedCount);
    byId.set(event.id, {
      id: event.id,
      status: event.status === "resolved" ? "resolved" : "open",
      severity,
      createdAt: event.created_at,
      sourceEventId: stringValue(payload?.sourceEventId),
      sentCount,
      failedCount,
      acknowledged: acknowledged.has(event.id),
      title: severity === "critical" ? "Serviceaviseringar kunde inte levereras" : "Serviceaviseringar levererades delvis",
      description: failedCount > 0
        ? `${failedCount} leveranser misslyckades och ${sentCount} leveranser lyckades.`
        : "Leveransutfallet behöver följas upp.",
    });
  }

  const items = [...byId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 50);

  return noStore({
    alerts: items,
    recoveries: recoveries.map((event) => ({ id: event.id, createdAt: event.created_at })),
    summary: {
      total: items.length,
      open: items.filter((item) => item.status === "open").length,
      unacknowledged: items.filter((item) => item.status === "open" && !item.acknowledged).length,
      critical: items.filter((item) => item.status === "open" && item.severity === "critical").length,
      resolved: items.filter((item) => item.status === "resolved").length,
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

  const modernAlert = await db.componentServiceDeliveryAlert.findFirst({
    where: { id: alertId, company_id: user.company_id },
    select: { id: true },
  });
  if (modernAlert) {
    const existing = await db.componentServiceDeliveryAlertAck.findUnique({
      where: { alert_id_user_id: { alert_id: alertId, user_id: user.id } },
      select: { id: true },
    });
    if (existing) return noStore({ success: true, acknowledged: false });
    await db.$transaction([
      db.componentServiceDeliveryAlertAck.create({
        data: { company_id: user.company_id, alert_id: alertId, user_id: user.id },
      }),
      db.auditLog.create({
        data: {
          company_id: user.company_id,
          actor_user_id: user.id,
          entity_type: "service_notification_delivery_alert",
          entity_id: alertId,
          action: "component_service_delivery_alert.acknowledged",
          metadata: { alertId, storage: "ComponentServiceDeliveryAlertAck" },
        },
      }),
    ]);
    return noStore({ success: true, acknowledged: true });
  }

  const legacyAlert = await db.integrationEvent.findFirst({
    where: { id: alertId, company_id: user.company_id, type: "component_service_delivery_alert" },
    select: { id: true },
  });
  if (legacyAlert) {
    return noStore({
      error: "Driftlarmet finns kvar i äldre lagring. Kör backfill till ComponentServiceDeliveryAlert innan det kan kvitteras.",
    }, { status: 409 });
  }

  return noStore({ error: "Driftlarmet hittades inte" }, { status: 404 });
}
