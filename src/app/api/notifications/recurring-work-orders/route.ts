import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { readRecurringSchedules } from "@/lib/recurring-work-order-engine";

export const dynamic = "force-dynamic";

type EventPayload = {
  generated?: number;
  failed?: number;
  error?: string;
  notificationKey?: string;
  status?: string;
  responseDueAt?: string | null;
  resolutionDueAt?: string | null;
  assignedToName?: string | null;
};

type ReadPayload = { notificationKey?: string };

type Notification = {
  key: string;
  title: string;
  description: string;
  dueAt: string;
  overdue: boolean;
  high: boolean;
  href: string;
  category?: "schedule" | "sla";
};

function objectPayload(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function eventPayload(value: Prisma.JsonValue | null): EventPayload {
  return (objectPayload(value) || {}) as EventPayload;
}

function notificationKey(value: Prisma.JsonValue | null) {
  const key = (objectPayload(value) as ReadPayload | null)?.notificationKey;
  return typeof key === "string" ? key : null;
}

async function slaNotifications(companyId: string, now: Date): Promise<Notification[]> {
  const events = await db.integrationEvent.findMany({
    where: {
      company_id: companyId,
      type: { in: ["recurring_incident_sla", "recurring_work_order_incident", "recurring_incident_assignment"] },
    },
    orderBy: { created_at: "desc" },
    select: { id: true, type: true, status: true, payload: true, created_at: true },
    take: 4000,
  });

  const sla = new Map<string, { responseDueAt: string | null; resolutionDueAt: string | null }>();
  const status = new Map<string, string>();
  const assignee = new Map<string, string | null>();

  for (const event of events) {
    const data = eventPayload(event.payload);
    if (!data.notificationKey) continue;
    if (event.type === "recurring_incident_sla" && !sla.has(data.notificationKey)) {
      sla.set(data.notificationKey, {
        responseDueAt: data.responseDueAt || null,
        resolutionDueAt: data.resolutionDueAt || null,
      });
    } else if (event.type === "recurring_work_order_incident" && !status.has(data.notificationKey)) {
      status.set(data.notificationKey, data.status || event.status);
    } else if (event.type === "recurring_incident_assignment" && !assignee.has(data.notificationKey)) {
      assignee.set(data.notificationKey, data.assignedToName || null);
    }
  }

  const warningWindow = 60 * 60 * 1000;
  const notifications: Notification[] = [];

  for (const [incidentKey, targets] of sla.entries()) {
    const incidentStatus = status.get(incidentKey) || "open";
    const owner = assignee.get(incidentKey);
    const ownerText = owner ? ` · Ansvarig ${owner}` : " · Saknar ansvarig";

    const addTarget = (kind: "response" | "resolution", dueAtValue: string | null, fulfilled: boolean) => {
      if (!dueAtValue || fulfilled) return;
      const dueAt = new Date(dueAtValue);
      if (Number.isNaN(dueAt.getTime())) return;
      const remaining = dueAt.getTime() - now.getTime();
      if (remaining > warningWindow) return;
      const overdue = remaining < 0;
      const label = kind === "response" ? "Svarstid" : "Lösningstid";
      notifications.push({
        key: `recurring-sla:${incidentKey}:${kind}:${dueAt.toISOString()}`,
        title: overdue ? `${label} har överskridits` : `${label} löper snart ut`,
        description: `${overdue ? "Förfallen" : "Mindre än en timme kvar"}${ownerText}`,
        dueAt: dueAt.toISOString(),
        overdue,
        high: overdue || kind === "resolution",
        href: "/dashboard/arbetsorder/aterkommande/incidenter",
        category: "sla",
      });
    };

    addTarget("response", targets.responseDueAt, incidentStatus === "acknowledged" || incidentStatus === "resolved");
    addTarget("resolution", targets.resolutionDueAt, incidentStatus === "resolved");
  }

  return notifications;
}

async function notificationsFor(companyId: string) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const historySince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [schedules, runs, slaAlerts] = await Promise.all([
    readRecurringSchedules(companyId),
    db.integrationEvent.findMany({
      where: {
        company_id: companyId,
        type: "recurring_work_orders_run",
        status: { in: ["partial", "failed"] },
        created_at: { gte: historySince },
      },
      orderBy: { created_at: "desc" },
      select: { id: true, status: true, payload: true, created_at: true },
      take: 20,
    }),
    slaNotifications(companyId, now),
  ]);

  const overdue: Notification[] = schedules
    .filter((schedule) => schedule.active && schedule.next_run_at && new Date(schedule.next_run_at) < staleBefore)
    .map((schedule) => {
      const dueAt = new Date(schedule.next_run_at!);
      const ageHours = Math.max(1, Math.floor((now.getTime() - dueAt.getTime()) / 3600000));
      return {
        key: `recurring-schedule:${schedule.id}:${dueAt.toISOString().slice(0, 10)}`,
        title: `Försenat schema: ${schedule.title || "Återkommande arbetsorder"}`,
        description: `${schedule.property_name || "Fastighet"} · försenat med cirka ${ageHours} timmar`,
        dueAt: dueAt.toISOString(),
        overdue: true,
        high: schedule.priority === "urgent" || ageHours >= 48,
        href: "/dashboard/arbetsorder/aterkommande/incidenter",
        category: "schedule",
      };
    });

  const failedRuns: Notification[] = runs.map((run) => {
    const payload = eventPayload(run.payload);
    const failed = typeof payload.failed === "number" ? payload.failed : 0;
    const generated = typeof payload.generated === "number" ? payload.generated : 0;
    const partial = run.status === "partial";
    return {
      key: `recurring-run:${run.id}`,
      title: partial ? "Delvis misslyckad schemakörning" : "Misslyckad schemakörning",
      description: payload.error || `${generated} skapade och ${failed} misslyckade arbetsordrar`,
      dueAt: run.created_at.toISOString(),
      overdue: run.status === "failed",
      high: true,
      href: "/dashboard/arbetsorder/aterkommande/incidenter",
      category: "schedule",
    };
  });

  return [...slaAlerts, ...failedRuns, ...overdue].sort((a, b) => {
    if (a.high !== b.high) return a.high ? -1 : 1;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const filter = new URL(request.url).searchParams.get("filter") || "all";
  const [all, reads] = await Promise.all([
    notificationsFor(user.company_id),
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: "recurring_notification_read", recipient: user.id, status: "read" },
      select: { payload: true },
      take: 2000,
    }),
  ]);

  const read = new Set(reads.map((item) => notificationKey(item.payload)).filter((value): value is string => Boolean(value)));
  const hydrated = all.map((item) => ({ ...item, read: read.has(item.key) }));
  const notifications = filter === "unread" ? hydrated.filter((item) => !item.read) : hydrated;

  return NextResponse.json({
    notifications,
    summary: {
      total: hydrated.length,
      unread: hydrated.filter((item) => !item.read).length,
      overdue: hydrated.filter((item) => item.overdue).length,
      high: hydrated.filter((item) => item.high).length,
      sla: hydrated.filter((item) => item.category === "sla").length,
      slaBreached: hydrated.filter((item) => item.category === "sla" && item.overdue).length,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const body = await request.json().catch(() => ({})) as { key?: unknown; all?: unknown; action?: unknown };
  if (body.action !== undefined && body.action !== "read") return NextResponse.json({ error: "Ogiltig åtgärd" }, { status: 400 });

  const all = await notificationsFor(user.company_id);
  const validKeys = new Set(all.map((item) => item.key));
  const keys = body.all === true ? Array.from(validKeys) : [typeof body.key === "string" ? body.key.trim() : ""].filter(Boolean);
  if (!keys.length || keys.some((key) => key.length > 500 || !validKeys.has(key))) {
    return NextResponse.json({ error: "Ogiltig eller obehörig avisering" }, { status: 400 });
  }

  const existing = await db.integrationEvent.findMany({
    where: { company_id: user.company_id, type: "recurring_notification_read", recipient: user.id, status: "read" },
    select: { payload: true },
  });
  const existingKeys = new Set(existing.map((item) => notificationKey(item.payload)).filter((value): value is string => Boolean(value)));
  const missing = Array.from(new Set(keys)).filter((key) => !existingKeys.has(key));
  if (missing.length) {
    await db.integrationEvent.createMany({
      data: missing.map((key) => ({
        company_id: user.company_id!,
        type: "recurring_notification_read",
        status: "read",
        recipient: user.id,
        payload: { notificationKey: key },
      })),
    });
  }

  return NextResponse.json({ success: true, marked: missing.length });
}
