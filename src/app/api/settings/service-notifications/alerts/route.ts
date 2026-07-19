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

function acknowledgedAlertId(payload: unknown) {
  const value = stringValue(record(payload)?.alertId);
  return value.length <= 100 ? value : "";
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
      where: { company_id: user.company_id, type: "component_service_delivery_alert" },
      orderBy: { created_at: "desc" },
      take: 50,
      select: { id: true, status: true, payload: true, created_at: true },
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

  const acknowledged = new Set(
    acknowledgements
      .map((event) => acknowledgedAlertId(event.payload))
      .filter(Boolean),
  );

  const items = alerts.map((event) => {
    const payload = record(event.payload);
    const severity = stringValue(payload?.severity) === "critical" ? "critical" : "warning";
    const sentCount = numberValue(payload?.sentCount);
    const failedCount = numberValue(payload?.failedCount);
    return {
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
    };
  });

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

  const alert = await db.integrationEvent.findFirst({
    where: { id: alertId, company_id: user.company_id, type: "component_service_delivery_alert" },
    select: { id: true },
  });
  if (!alert) return noStore({ error: "Driftlarmet hittades inte" }, { status: 404 });

  const existing = await db.integrationEvent.findFirst({
    where: {
      company_id: user.company_id,
      type: "component_service_delivery_alert_acknowledgement",
      recipient: user.id,
      status: "acknowledged",
    },
    orderBy: { created_at: "desc" },
    select: { payload: true },
  });
  if (acknowledgedAlertId(existing?.payload) === alertId) {
    return noStore({ success: true, acknowledged: false });
  }

  await db.$transaction([
    db.integrationEvent.create({
      data: {
        company_id: user.company_id,
        type: "component_service_delivery_alert_acknowledgement",
        status: "acknowledged",
        recipient: user.id,
        payload: { alertId },
      },
    }),
    db.auditLog.create({
      data: {
        company_id: user.company_id,
        actor_user_id: user.id,
        entity_type: "service_notification_delivery_alert",
        entity_id: alertId,
        action: "component_service_delivery_alert.acknowledged",
        metadata: { alertId },
      },
    }),
  ]);

  return noStore({ success: true, acknowledged: true });
}
