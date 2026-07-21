import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { readRecurringSchedules } from "@/lib/recurring-work-order-engine";

export const dynamic = "force-dynamic";

const INCIDENT_TYPE = "recurring_work_order_incident";
const ESCALATION_TYPE = "recurring_incident_escalation";
const ASSIGNMENT_TYPE = "recurring_incident_assignment";
const SLA_TYPE = "recurring_incident_sla";
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
    db.integrationEvent.findMany({ where: { company_id: companyId, type: "recurring_work_orders_run", status: { in: ["partial", "failed"] }, created_at: { gte: historySince } }, select: { id: true }, take: 100 }),
  ]);
  return new Set([
    ...runs.map((run) => `recurring-run:${run.id}`),
    ...schedules.filter((schedule) => schedule.active && schedule.next_run_at && new Date(schedule.next_run_at) < staleBefore).map((schedule) => `recurring-schedule:${schedule.id}:${new Date(schedule.next_run_at!).toISOString().slice(0, 10)}`),
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
    db.integrationEvent.findMany({
      where: { company_id: user.company_id, type: { in: [INCIDENT_TYPE, ESCALATION_TYPE, ASSIGNMENT_TYPE, SLA_TYPE] } },
      orderBy: { created_at: "desc" },
      select: { id: true, type: true, status: true, recipient: true, payload: true, created_at: true },
      take: 4000,
    }),
    db.user.findMany({ where: { company_id: user.company_id, status: "active" }, orderBy: [{ name: "asc" }, { email: "asc" }], select: { id: true, name: true, email: true, role: true } }),
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
    if (!data.notificationKey) continue;
    const timeline = timelines.get(data.notificationKey) || [];
    if (event.type === ESCALATION_TYPE) {
      const level = typeof data.level === "number" ? data.level : Number(String(event.status).replace("level_", "")) || 1;
      timeline.push({ id: event.id, kind: "escalation", status: `level_${level}`, level, comment: data.reason || "Incidenten har eskalerats automatiskt", changedBy: event.recipient, changedByName: level >= 2 ? "Automatisk eskalering till ledning" : "Automatisk eskalering till driftansvarig", changedAt: data.escalatedAt || event.created_at.toISOString() });
      escalationLevel.set(data.notificationKey, Math.max(escalationLevel.get(data.notificationKey) || 0, level));
      if (!lastEscalatedAt.has(data.notificationKey)) lastEscalatedAt.set(data.notificationKey, data.escalatedAt || event.created_at.toISOString());
    } else if (event.type === ASSIGNMENT_TYPE) {
      const assignedAt = data.assignedAt || event.created_at.toISOString();
      timeline.push({ id: event.id, kind: "assignment", status: data.assignedTo ? "assigned" : "unassigned", comment: data.assignedTo ? `Tilldelad ${data.assignedToName || "användare"}` : "Ansvarig borttagen", changedBy: data.assignedBy || event.recipient, changedByName: data.assignedByName || "Användare", changedAt: assignedAt });
      if (!assignments.has(data.notificationKey)) assignments.set(data.notificationKey, { id: data.assignedTo || null, name: data.assignedToName || null, assignedAt });
    } else if (event.type === SLA_TYPE) {
      const changedAt = data.slaChangedAt || event.created_at.toISOString();
      timeline.push({ id: event.id, kind: "sla", status: "sla_updated", comment: `Svar senast ${data.responseDueAt ? new Date(data.responseDueAt).toLocaleString("sv-SE") : "ej satt"}, lösning senast ${data.resolutionDueAt ? new Date(data.resolutionDueAt).toLocaleString("sv-SE") : "ej satt"}`, changedBy: data.slaChangedBy || event.recipient, changedByName: data.slaChangedByName || "Användare", changedAt });
      if (!slaTargets.has(data.notificationKey)) slaTargets.set(data.notificationKey, { responseDueAt: data.responseDueAt || null, resolutionDueAt: data.resolutionDueAt || null, changedAt });
    } else {
      const changedAt = data.changedAt || event.created_at.toISOString();
      timeline.push({ id: event.id, kind: "action", status: data.status || event.status, comment: data.comment || "", changedBy: data.changedBy || event.recipient, changedByName: data.changedByName || "Användare", changedAt });
      if (!operationalStatus.has(data.notificationKey)) operationalStatus.set(data.notificationKey, data.status || event.status);
      if (data.status === "acknowledged" && !acknowledgedAt.has(data.notificationKey)) acknowledgedAt.set(data.notificationKey, changedAt);
      if (data.status === "resolved" && !resolvedAt.has(data.notificationKey)) resolvedAt.set(data.notificationKey, changedAt);
    }
    timelines.set(data.notificationKey, timeline);
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

  const body = await request.json().catch(() => ({})) as { action?: unknown; notificationKey?: unknown; status?: unknown; comment?: unknown; assignedTo?: unknown; responseDueAt?: unknown; resolutionDueAt?: unknown };
  const notificationKey = typeof body.notificationKey === "string" ? body.notificationKey.trim() : "";
  if (!notificationKey) return NextResponse.json({ error: "Incident krävs" }, { status: 400 });
  const validKeys = await validIncidentKeys(user.company_id);
  if (!validKeys.has(notificationKey)) return NextResponse.json({ error: "Incidenten finns inte eller tillhör en annan organisation" }, { status: 404 });

  if (body.action === "assign") {
    const assignedTo = typeof body.assignedTo === "string" && body.assignedTo.trim() ? body.assignedTo.trim() : null;
    const assignee = assignedTo ? await db.user.findFirst({ where: { id: assignedTo, company_id: user.company_id, status: "active" }, select: { id: true, name: true, email: true } }) : null;
    if (assignedTo && !assignee) return NextResponse.json({ error: "Ansvarig användare hittades inte i organisationen" }, { status: 404 });
    const assignedAt = new Date().toISOString();
    const event = await db.integrationEvent.create({ data: { company_id: user.company_id, type: ASSIGNMENT_TYPE, status: assignedTo ? "assigned" : "unassigned", recipient: assignedTo || user.id, payload: { notificationKey, assignedTo, assignedToName: assignee?.name || assignee?.email || null, assignedBy: user.id, assignedByName: user.name || user.email || "Användare", assignedAt } }, select: { id: true } });
    return NextResponse.json({ success: true, id: event.id, assignedUser: assignee ? { id: assignee.id, name: assignee.name || assignee.email } : null, assignedAt }, { status: 201 });
  }

  if (body.action === "sla") {
    const responseDueAt = typeof body.responseDueAt === "string" && body.responseDueAt ? new Date(body.responseDueAt) : null;
    const resolutionDueAt = typeof body.resolutionDueAt === "string" && body.resolutionDueAt ? new Date(body.resolutionDueAt) : null;
    if ((responseDueAt && Number.isNaN(responseDueAt.getTime())) || (resolutionDueAt && Number.isNaN(resolutionDueAt.getTime()))) return NextResponse.json({ error: "Ogiltigt SLA-datum" }, { status: 400 });
    if (responseDueAt && resolutionDueAt && responseDueAt > resolutionDueAt) return NextResponse.json({ error: "Svarstiden måste ligga före lösningstiden" }, { status: 400 });
    const slaChangedAt = new Date().toISOString();
    const event = await db.integrationEvent.create({ data: { company_id: user.company_id, type: SLA_TYPE, status: "updated", recipient: user.id, payload: { notificationKey, responseDueAt: responseDueAt?.toISOString() || null, resolutionDueAt: resolutionDueAt?.toISOString() || null, slaChangedBy: user.id, slaChangedByName: user.name || user.email || "Användare", slaChangedAt } }, select: { id: true } });
    return NextResponse.json({ success: true, id: event.id, responseDueAt: responseDueAt?.toISOString() || null, resolutionDueAt: resolutionDueAt?.toISOString() || null, slaChangedAt }, { status: 201 });
  }

  const status = typeof body.status === "string" ? body.status as IncidentStatus : "acknowledged";
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (!["acknowledged", "resolved", "reopened"].includes(status)) return NextResponse.json({ error: "Ogiltig incidentåtgärd" }, { status: 400 });
  if (comment.length > 2000) return NextResponse.json({ error: "Kommentaren är för lång" }, { status: 400 });
  const changedAt = new Date().toISOString();
  const event = await db.integrationEvent.create({ data: { company_id: user.company_id, type: INCIDENT_TYPE, status, recipient: user.id, payload: { notificationKey, status, comment, changedBy: user.id, changedByName: user.name || user.email || "Användare", changedAt } }, select: { id: true } });
  return NextResponse.json({ success: true, id: event.id, status, changedAt }, { status: 201 });
}
