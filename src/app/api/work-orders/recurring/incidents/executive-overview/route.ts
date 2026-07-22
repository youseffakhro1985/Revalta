import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const INCIDENT_TYPE = "recurring_work_order_incident";
const ASSIGNMENT_TYPE = "recurring_incident_assignment";
const SLA_TYPE = "recurring_incident_sla";
const ESCALATION_TYPE = "recurring_incident_escalation";

type Payload = {
  notificationKey?: string;
  status?: string;
  changedAt?: string;
  assignedTo?: string | null;
  assignedToName?: string | null;
  assignedAt?: string;
  responseDueAt?: string | null;
  resolutionDueAt?: string | null;
  slaChangedAt?: string;
  level?: number;
  escalatedAt?: string;
};

type Snapshot = {
  notificationKey: string;
  source: string;
  status: string;
  assignee: string;
  slaChangedAt: string;
  responseDueAt: string | null;
  resolutionDueAt: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  escalationLevel: number;
  activeBreach: boolean;
  responseMet: boolean | null;
  resolutionMet: boolean | null;
  riskScore: number;
};

function payload(value: Prisma.JsonValue | null): Payload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Payload : {};
}

function rate(met: number, measured: number) {
  return measured ? Math.round((met / measured) * 1000) / 10 : null;
}

function delta(current: number | null, previous: number | null) {
  return current === null || previous === null ? null : Math.round((current - previous) * 10) / 10;
}

function summarize(rows: Snapshot[]) {
  const responseMeasured = rows.filter((row) => row.responseMet !== null);
  const resolutionMeasured = rows.filter((row) => row.resolutionMet !== null);
  const responseMet = responseMeasured.filter((row) => row.responseMet).length;
  const resolutionMet = resolutionMeasured.filter((row) => row.resolutionMet).length;
  return {
    incidents: rows.length,
    open: rows.filter((row) => row.status !== "resolved").length,
    resolved: rows.filter((row) => row.status === "resolved").length,
    activeBreaches: rows.filter((row) => row.activeBreach).length,
    escalated: rows.filter((row) => row.escalationLevel > 0 && row.status !== "resolved").length,
    unassigned: rows.filter((row) => row.assignee === "Ej tilldelad" && row.status !== "resolved").length,
    responseCompliance: rate(responseMet, responseMeasured.length),
    resolutionCompliance: rate(resolutionMet, resolutionMeasured.length),
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const days = Math.min(180, Math.max(7, Number(params.get("days") || 30) || 30));
  const now = new Date();
  const currentFrom = new Date(now.getTime() - days * 86400000);
  const previousFrom = new Date(currentFrom.getTime() - days * 86400000);

  const events = await db.integrationEvent.findMany({
    where: {
      company_id: user.company_id,
      type: { in: [INCIDENT_TYPE, ASSIGNMENT_TYPE, SLA_TYPE, ESCALATION_TYPE] },
      created_at: { gte: new Date(previousFrom.getTime() - 365 * 86400000), lte: now },
    },
    orderBy: { created_at: "asc" },
    select: { id: true, type: true, status: true, payload: true, created_at: true },
    take: 15000,
  });

  const groups = new Map<string, typeof events>();
  for (const event of events) {
    const key = payload(event.payload).notificationKey;
    if (!key) continue;
    const group = groups.get(key) || [];
    group.push(event);
    groups.set(key, group);
  }

  const snapshots: Snapshot[] = [];
  const nowMs = now.getTime();
  for (const [notificationKey, group] of groups) {
    let status = "open";
    let assignee = "Ej tilldelad";
    let slaChangedAt: string | null = null;
    let responseDueAt: string | null = null;
    let resolutionDueAt: string | null = null;
    let acknowledgedAt: string | null = null;
    let resolvedAt: string | null = null;
    let escalationLevel = 0;

    for (const event of group) {
      const data = payload(event.payload);
      if (event.type === SLA_TYPE) {
        slaChangedAt = data.slaChangedAt || event.created_at.toISOString();
        responseDueAt = data.responseDueAt || null;
        resolutionDueAt = data.resolutionDueAt || null;
      } else if (event.type === ASSIGNMENT_TYPE) {
        assignee = data.assignedTo ? data.assignedToName || "Tilldelad användare" : "Ej tilldelad";
      } else if (event.type === ESCALATION_TYPE) {
        escalationLevel = Math.max(escalationLevel, typeof data.level === "number" ? data.level : 1);
      } else if (event.type === INCIDENT_TYPE) {
        const changedAt = data.changedAt || event.created_at.toISOString();
        status = data.status || event.status;
        if (status === "acknowledged" && !acknowledgedAt) acknowledgedAt = changedAt;
        if (status === "resolved") resolvedAt = changedAt;
        if (status === "reopened") resolvedAt = null;
      }
    }

    if (!slaChangedAt || new Date(slaChangedAt) < previousFrom || new Date(slaChangedAt) > now) continue;
    const responseDecided = Boolean(responseDueAt && (acknowledgedAt || new Date(responseDueAt).getTime() < nowMs));
    const resolutionDecided = Boolean(resolutionDueAt && (resolvedAt || new Date(resolutionDueAt).getTime() < nowMs));
    const responseMet = !responseDecided ? null : Boolean(responseDueAt && acknowledgedAt && new Date(acknowledgedAt) <= new Date(responseDueAt));
    const resolutionMet = !resolutionDecided ? null : Boolean(resolutionDueAt && resolvedAt && new Date(resolvedAt) <= new Date(resolutionDueAt));
    const responseBreached = Boolean(responseDueAt && !acknowledgedAt && new Date(responseDueAt).getTime() < nowMs);
    const resolutionBreached = Boolean(resolutionDueAt && status !== "resolved" && new Date(resolutionDueAt).getTime() < nowMs);
    const activeBreach = status !== "resolved" && (responseBreached || resolutionBreached);
    const riskScore = (resolutionBreached ? 50 : 0) + (responseBreached ? 30 : 0) + escalationLevel * 10 + (assignee === "Ej tilldelad" && status !== "resolved" ? 15 : 0) + (status === "reopened" ? 5 : 0);

    snapshots.push({
      notificationKey,
      source: notificationKey.startsWith("recurring-run:") ? "Schemakörning" : "Försenat schema",
      status,
      assignee,
      slaChangedAt,
      responseDueAt,
      resolutionDueAt,
      acknowledgedAt,
      resolvedAt,
      escalationLevel,
      activeBreach,
      responseMet,
      resolutionMet,
      riskScore,
    });
  }

  const currentRows = snapshots.filter((row) => new Date(row.slaChangedAt) >= currentFrom);
  const previousRows = snapshots.filter((row) => new Date(row.slaChangedAt) >= previousFrom && new Date(row.slaChangedAt) < currentFrom);
  const current = summarize(currentRows);
  const previous = summarize(previousRows);

  const workloadMap = new Map<string, { open: number; breaches: number; escalated: number }>();
  for (const row of currentRows.filter((item) => item.status !== "resolved")) {
    const value = workloadMap.get(row.assignee) || { open: 0, breaches: 0, escalated: 0 };
    value.open += 1;
    value.breaches += row.activeBreach ? 1 : 0;
    value.escalated += row.escalationLevel > 0 ? 1 : 0;
    workloadMap.set(row.assignee, value);
  }

  const workload = [...workloadMap.entries()]
    .map(([assignee, values]) => ({ assignee, ...values }))
    .sort((a, b) => b.breaches - a.breaches || b.open - a.open || a.assignee.localeCompare(b.assignee));

  const critical = [...currentRows]
    .filter((row) => row.status !== "resolved")
    .sort((a, b) => b.riskScore - a.riskScore || a.notificationKey.localeCompare(b.notificationKey))
    .slice(0, 10);

  return NextResponse.json({
    period: { days, currentFrom: currentFrom.toISOString(), currentTo: now.toISOString(), previousFrom: previousFrom.toISOString(), previousTo: currentFrom.toISOString() },
    current,
    previous,
    trend: {
      incidents: current.incidents - previous.incidents,
      activeBreaches: current.activeBreaches - previous.activeBreaches,
      unassigned: current.unassigned - previous.unassigned,
      responseCompliance: delta(current.responseCompliance, previous.responseCompliance),
      resolutionCompliance: delta(current.resolutionCompliance, previous.resolutionCompliance),
    },
    workload,
    critical,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
