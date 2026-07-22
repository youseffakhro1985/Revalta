import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const INCIDENT_TYPE = "recurring_work_order_incident";
const ASSIGNMENT_TYPE = "recurring_incident_assignment";
const SLA_TYPE = "recurring_incident_sla";

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
};

type ReportRow = {
  notificationKey: string;
  source: string;
  assignee: string;
  status: string;
  responseDueAt: string | null;
  acknowledgedAt: string | null;
  responseMet: boolean | null;
  responseHours: number | null;
  resolutionDueAt: string | null;
  resolvedAt: string | null;
  resolutionMet: boolean | null;
  resolutionHours: number | null;
  activeBreach: boolean;
};

function payload(value: Prisma.JsonValue | null): Payload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Payload : {};
}

function parsePeriod(request: Request) {
  const params = new URL(request.url).searchParams;
  const days = Math.min(365, Math.max(7, Number(params.get("days") || 30) || 30));
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { days, from, to, format: params.get("format") || "json" };
}

function hoursBetween(start: string, end: string) {
  return Math.max(0, Math.round(((new Date(end).getTime() - new Date(start).getTime()) / 3600000) * 10) / 10);
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { days, from, to, format } = parsePeriod(request);
  const events = await db.integrationEvent.findMany({
    where: {
      company_id: user.company_id,
      type: { in: [INCIDENT_TYPE, ASSIGNMENT_TYPE, SLA_TYPE] },
      created_at: { gte: new Date(from.getTime() - 365 * 24 * 60 * 60 * 1000), lte: to },
    },
    orderBy: { created_at: "asc" },
    select: { id: true, type: true, status: true, payload: true, created_at: true },
    take: 10000,
  });

  const groups = new Map<string, typeof events>();
  for (const event of events) {
    const key = payload(event.payload).notificationKey;
    if (!key) continue;
    const group = groups.get(key) || [];
    group.push(event);
    groups.set(key, group);
  }

  const now = Date.now();
  const rows: ReportRow[] = [];
  for (const [notificationKey, group] of groups) {
    let responseDueAt: string | null = null;
    let resolutionDueAt: string | null = null;
    let slaChangedAt: string | null = null;
    let acknowledgedAt: string | null = null;
    let resolvedAt: string | null = null;
    let status = "open";
    let assignee = "Ej tilldelad";

    for (const event of group) {
      const data = payload(event.payload);
      if (event.type === SLA_TYPE) {
        responseDueAt = data.responseDueAt || null;
        resolutionDueAt = data.resolutionDueAt || null;
        slaChangedAt = data.slaChangedAt || event.created_at.toISOString();
      } else if (event.type === ASSIGNMENT_TYPE) {
        assignee = data.assignedTo ? data.assignedToName || "Tilldelad användare" : "Ej tilldelad";
      } else if (event.type === INCIDENT_TYPE) {
        const changedAt = data.changedAt || event.created_at.toISOString();
        status = data.status || event.status;
        if (status === "acknowledged" && !acknowledgedAt) acknowledgedAt = changedAt;
        if (status === "resolved") resolvedAt = changedAt;
        if (status === "reopened") resolvedAt = null;
      }
    }

    if (!slaChangedAt || new Date(slaChangedAt) < from || new Date(slaChangedAt) > to) continue;
    const responseDecided = Boolean(responseDueAt && (acknowledgedAt || new Date(responseDueAt).getTime() < now));
    const resolutionDecided = Boolean(resolutionDueAt && (resolvedAt || new Date(resolutionDueAt).getTime() < now));
    const responseMet = !responseDecided ? null : Boolean(responseDueAt && acknowledgedAt && new Date(acknowledgedAt) <= new Date(responseDueAt));
    const resolutionMet = !resolutionDecided ? null : Boolean(resolutionDueAt && resolvedAt && new Date(resolvedAt) <= new Date(resolutionDueAt));
    const activeBreach = status !== "resolved" && Boolean(
      (responseDueAt && !acknowledgedAt && new Date(responseDueAt).getTime() < now) ||
      (resolutionDueAt && new Date(resolutionDueAt).getTime() < now),
    );

    rows.push({
      notificationKey,
      source: notificationKey.startsWith("recurring-run:") ? "Schemakörning" : "Försenat schema",
      assignee,
      status,
      responseDueAt,
      acknowledgedAt,
      responseMet,
      responseHours: slaChangedAt && acknowledgedAt ? hoursBetween(slaChangedAt, acknowledgedAt) : null,
      resolutionDueAt,
      resolvedAt,
      resolutionMet,
      resolutionHours: slaChangedAt && resolvedAt ? hoursBetween(slaChangedAt, resolvedAt) : null,
      activeBreach,
    });
  }

  rows.sort((a, b) => Number(b.activeBreach) - Number(a.activeBreach) || a.notificationKey.localeCompare(b.notificationKey));
  const responseMeasured = rows.filter((row) => row.responseMet !== null);
  const resolutionMeasured = rows.filter((row) => row.resolutionMet !== null);
  const average = (values: Array<number | null>) => {
    const valid = values.filter((value): value is number => typeof value === "number");
    return valid.length ? Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10 : null;
  };

  const summary = {
    periodDays: days,
    from: from.toISOString(),
    to: to.toISOString(),
    incidents: rows.length,
    responseMeasured: responseMeasured.length,
    responseMet: responseMeasured.filter((row) => row.responseMet).length,
    responseCompliance: responseMeasured.length ? Math.round((responseMeasured.filter((row) => row.responseMet).length / responseMeasured.length) * 1000) / 10 : null,
    resolutionMeasured: resolutionMeasured.length,
    resolutionMet: resolutionMeasured.filter((row) => row.resolutionMet).length,
    resolutionCompliance: resolutionMeasured.length ? Math.round((resolutionMeasured.filter((row) => row.resolutionMet).length / resolutionMeasured.length) * 1000) / 10 : null,
    averageResponseHours: average(rows.map((row) => row.responseHours)),
    averageResolutionHours: average(rows.map((row) => row.resolutionHours)),
    activeBreaches: rows.filter((row) => row.activeBreach).length,
    unassigned: rows.filter((row) => row.assignee === "Ej tilldelad" && row.status !== "resolved").length,
  };

  if (format === "csv") {
    const header = ["Incident", "Källa", "Ansvarig", "Status", "Svar senast", "Kvitterad", "Svarsmål uppfyllt", "Svarstid timmar", "Lösning senast", "Löst", "Lösningsmål uppfyllt", "Lösningstid timmar", "Aktivt SLA-brott"];
    const lines = [header.map(csvCell).join(";")];
    for (const row of rows) {
      lines.push([
        row.notificationKey, row.source, row.assignee, row.status, row.responseDueAt, row.acknowledgedAt,
        row.responseMet === null ? "" : row.responseMet ? "Ja" : "Nej", row.responseHours,
        row.resolutionDueAt, row.resolvedAt, row.resolutionMet === null ? "" : row.resolutionMet ? "Ja" : "Nej",
        row.resolutionHours, row.activeBreach ? "Ja" : "Nej",
      ].map(csvCell).join(";"));
    }
    return new NextResponse(`\uFEFF${lines.join("\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="revalta-sla-rapport-${days}-dagar.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return NextResponse.json({ summary, rows }, { headers: { "Cache-Control": "private, no-store" } });
}
