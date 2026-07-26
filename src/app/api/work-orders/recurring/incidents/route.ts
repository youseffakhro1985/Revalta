import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { createRecurringIncidentEvent, listRecurringIncidentEvents } from "@/lib/recurring-incident-storage";
import { listRecurringRuns, readRecurringSchedules } from "@/lib/recurring-work-order-engine";

export const dynamic = "force-dynamic";

type IncidentStatus = "acknowledged" | "resolved" | "reopened";
type IncidentPayload = {
  notificationKey?: string;
  status?: IncidentStatus;
  comment?: string;
  changedBy?: string;
  changedByName?: string;
  changedAt?: string;
  level?: number;
  reason?: string;
  escalatedAt?: string;
  assignedTo?: string | null;
  assignedToName?: string | null;
  assignedBy?: string;
  assignedByName?: string;
  assignedAt?: string;
  responseDueAt?: string;
  resolutionDueAt?: string;
  slaChangedBy?: string;
  slaChangedByName?: string;
  slaChangedAt?: string;
};

function payload(value: Prisma.JsonValue | null): IncidentPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as IncidentPayload : {};
}

async function validIncidentKeys(companyId: string) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const historySince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [schedules, runs] = await Promise.all([
    readRecurringSchedules(companyId),
    listRecurringRuns(companyId, { statuses: ["partial", "failed"], since: historySince, take: 100 }),
  ]);
  return new Set([
    ...runs.map((run) => `recurring-run:${run.id}`),
    ...schedules
      .filter((schedule) => schedule.active && schedule.next_run_at && new Date(schedule.next_run_at) < staleBefore)
      .map((schedule) => `recurring-schedule:${schedule.id}:${new Date(schedule.next_run_at!).toISOString().slice(0, 10)}`),
  ]);
}

function slaState(dueAt: string | null, fulfilled: boolean) {
  if (!dueAt || fulfilled) return fulfilled ? "met" : "unset";
  const remaining = new Date(dueAt).getTime() - Date.now();
  if (remaining < 0) return "breached";
  if (remaining <= 60 * 60 * 1000) return "at_risk";
  return "on_track";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const [events, users] = await Promise.all([
    listRecurringIncidentEvents(user.company_id, { take: 4000 }),
    db.user.findMany({
      where: { company_id: user.company_id, status: "active" },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);

  const timelines = new Map<string, Array<Record<string, unknown>>>();
  const operationalStatus = new Map<string, string>();
  const escalationLevel = new Map<string, number>();
  const lastEscalatedAt = new Map<string, string>();
  const assignments = new Map<string, { id: string | null; name: string | null; assignedAt: string | null }>();
  const slaTargets = new Map<string, { responseDueAt: string | null; resolutionDueAt: string | null; changedAt: string | null }>();
  const acknowledgedAt = new Map<string, string>();
  const resolvedAt = new Map<string, string>();

  for (const event of events) {
    const data = payload(event.payload);
    const key = event.notification_key || data.notificationKey;
    if (!key) continue;
    const timeline = timelines.get(key) || [];
    if (event.event_type === "escalation") {
      const level = typeof data.level === "number" ? data.level : Number(String(event.status).replace("level_", "")) || 1;
      timeline.push({
        id: event.id,
        kind: "escalation",
        status: `level_${level}`,
        level,
        comment: data.reason || "Incidenten har eskalerats automatiskt",
        changedBy: event.recipient,
        changedByName: level >= 2 ? "Automatisk eskalering till ledning" : "Automatisk eskalering till driftansvarig",
        changedAt: data.escalatedAt || event.created_at.toISOString(),
      });
      escalationLevel.set(key, Math.max(escalationLevel.get(key) || 0, level));
      if (!lastEscalatedAt.has(key)) lastEscalatedAt.set(key, data.escalatedAt || event.created_at.toISOString());
    } else if (event.event_type === "assignment") {
      const assignedAt = data.assignedAt || event.created_at.toISOString();
      timeline.push({
        id: event.id,
        kind: "assignment",
        status: data.assignedTo ? "assigned" : "unassigned",
        comment: data.assignedTo ? `Tilldelad ${data.assignedToName || "användare"}` : "Ansvarig borttagen",
        changedBy: data.assignedBy || event.recipient,
        changedByName: data.assignedByName || "Användare",
        changedAt: assignedAt,
      });
      if (!assignments.has(key)) assignments.set(key, { id: data.assignedTo || null, name: data.assignedToName || null, assignedAt });
    } else if (event.event_type === "sla") {
      const changedAt = data.slaChangedAt || event.created_at.toISOString();
      timeline.push({
        id: event.id,
        kind: "sla",
        status: "sla_updated",
        comment: `Svar senast ${data.responseDueAt ? new Date(data.responseDueAt).toLocaleString("sv-SE") : "ej satt"}, lösning senast ${data.resolutionDueAt ? new Date(data.resolutionDueAt).toLocaleString("sv-SE") : "ej satt"}`,
        changedBy: data.slaChangedBy || event.recipient,
        changedByName: data.slaChangedByName || "Användare",
        changedAt,
      });
      if (!slaTargets.has(key)) {
        slaTargets.set(key, {
          responseDueAt: data.responseDueAt || null,
          resolutionDueAt: data.resolutionDueAt || null,
          changedAt,
        });
      }
    } else {
      const changedAt = data.changedAt || event.created_at.toISOString();
      timeline.push({
        id: event.id,
        kind: "action",
        status: data.status || event.status,
        comment: data.comment || "",
        changedBy: data.changedBy || event.recipient,
        changedByName: data.changedByName || "Användare",
        changedAt,
      });
      if (!operationalStatus.has(key)) operationalStatus.set(key, data.status || event.status);
      if (data.status === "acknowledged" && !acknowledgedAt.has(key)) acknowledgedAt.set(key, changedAt);
      if (data.status === "resolved" && !resolvedAt.has(key)) resolvedAt.set(key, changedAt);
    }
    timelines.set(key, timeline);
  }

  const incidents = [...timelines.entries()].map(([notificationKey, timeline]) => {
    const status = operationalStatus.get(notificationKey) || "open";
    const sla = slaTargets.get(notificationKey) || { responseDueAt: null, resolutionDueAt: null, changedAt: null };
    return {
      notificationKey,
      status,
      escalationLevel: escalationLevel.get(notificationKey) || 0,
      lastEscalatedAt: lastEscalatedAt.get(notificationKey) || null,
      assignedUser: assignments.get(notificationKey) || { id: null, name: null, assignedAt: null },
      sla: {
        ...sla,
        responseStatus: slaState(sla.responseDueAt, Boolean(acknowledgedAt.get(notificationKey) || resolvedAt.get(notificationKey))),
        resolutionStatus: slaState(sla.resolutionDueAt, status === "resolved"),
        acknowledgedAt: acknowledgedAt.get(notificationKey) || null,
        resolvedAt: resolvedAt.get(notificationKey) || null,
      },
      latest: timeline[0],
      timeline,
    };
  });
  return NextResponse.json({ incidents, users }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as {
    action?: unknown;
    notificationKey?: unknown;
    status?: unknown;
    comment?: unknown;
    assignedTo?: unknown;
    responseDueAt?: unknown;
    resolutionDueAt?: unknown;
  };
  const notificationKey = typeof body.notificationKey === "string" ? body.notificationKey.trim() : "";
  if (!notificationKey) return NextResponse.json({ error: "Incident krävs" }, { status: 400 });
  const validKeys = await validIncidentKeys(user.company_id);
  if (!validKeys.has(notificationKey)) {
    return NextResponse.json({ error: "Incidenten finns inte eller tillhör en annan organisation" }, { status: 404 });
  }

  if (body.action === "assign") {
    const assignedTo = typeof body.assignedTo === "string" && body.assignedTo.trim() ? body.assignedTo.trim() : null;
    const assignee = assignedTo
      ? await db.user.findFirst({
          where: { id: assignedTo, company_id: user.company_id, status: "active" },
          select: { id: true, name: true, email: true },
        })
      : null;
    if (assignedTo && !assignee) return NextResponse.json({ error: "Ansvarig användare hittades inte i organisationen" }, { status: 404 });
    const assignedAt = new Date().toISOString();
    const event = await createRecurringIncidentEvent({
      companyId: user.company_id,
      notificationKey,
      eventType: "assignment",
      status: assignedTo ? "assigned" : "unassigned",
      recipient: assignedTo || user.id,
      payload: {
        notificationKey,
        assignedTo,
        assignedToName: assignee?.name || assignee?.email || null,
        assignedBy: user.id,
        assignedByName: user.name || user.email || "Användare",
        assignedAt,
      },
    });
    return NextResponse.json({
      success: true,
      id: event.id,
      assignedUser: assignee ? { id: assignee.id, name: assignee.name || assignee.email } : null,
      assignedAt,
    }, { status: 201 });
  }

  if (body.action === "sla") {
    const responseDueAt = typeof body.responseDueAt === "string" && body.responseDueAt ? new Date(body.responseDueAt) : null;
    const resolutionDueAt = typeof body.resolutionDueAt === "string" && body.resolutionDueAt ? new Date(body.resolutionDueAt) : null;
    if ((responseDueAt && Number.isNaN(responseDueAt.getTime())) || (resolutionDueAt && Number.isNaN(resolutionDueAt.getTime()))) {
      return NextResponse.json({ error: "Ogiltigt SLA-datum" }, { status: 400 });
    }
    if (responseDueAt && resolutionDueAt && responseDueAt > resolutionDueAt) {
      return NextResponse.json({ error: "Svarstiden måste ligga före lösningstiden" }, { status: 400 });
    }
    const slaChangedAt = new Date().toISOString();
    const event = await createRecurringIncidentEvent({
      companyId: user.company_id,
      notificationKey,
      eventType: "sla",
      status: "updated",
      recipient: user.id,
      payload: {
        notificationKey,
        responseDueAt: responseDueAt?.toISOString() || null,
        resolutionDueAt: resolutionDueAt?.toISOString() || null,
        slaChangedBy: user.id,
        slaChangedByName: user.name || user.email || "Användare",
        slaChangedAt,
      },
    });
    return NextResponse.json({
      success: true,
      id: event.id,
      responseDueAt: responseDueAt?.toISOString() || null,
      resolutionDueAt: resolutionDueAt?.toISOString() || null,
      slaChangedAt,
    }, { status: 201 });
  }

  const status = typeof body.status === "string" ? body.status as IncidentStatus : "acknowledged";
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (!["acknowledged", "resolved", "reopened"].includes(status)) {
    return NextResponse.json({ error: "Ogiltig incidentåtgärd" }, { status: 400 });
  }
  if (comment.length > 2000) return NextResponse.json({ error: "Kommentaren är för lång" }, { status: 400 });
  const changedAt = new Date().toISOString();
  const event = await createRecurringIncidentEvent({
    companyId: user.company_id,
    notificationKey,
    eventType: "status",
    status,
    recipient: user.id,
    payload: {
      notificationKey,
      status,
      comment,
      changedBy: user.id,
      changedByName: user.name || user.email || "Användare",
      changedAt,
    },
  });
  return NextResponse.json({ success: true, id: event.id, status, changedAt }, { status: 201 });
}
