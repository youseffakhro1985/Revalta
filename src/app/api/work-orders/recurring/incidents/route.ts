import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { readRecurringSchedules } from "@/lib/recurring-work-order-engine";

export const dynamic = "force-dynamic";

const INCIDENT_TYPE = "recurring_work_order_incident";
type IncidentStatus = "acknowledged" | "resolved" | "reopened";
type IncidentPayload = {
  notificationKey?: string;
  status?: IncidentStatus;
  comment?: string;
  changedBy?: string;
  changedByName?: string;
  changedAt?: string;
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
    db.integrationEvent.findMany({
      where: { company_id: companyId, type: "recurring_work_orders_run", status: { in: ["partial", "failed"] }, created_at: { gte: historySince } },
      select: { id: true },
      take: 100,
    }),
  ]);
  return new Set([
    ...runs.map((run) => `recurring-run:${run.id}`),
    ...schedules
      .filter((schedule) => schedule.active && schedule.next_run_at && new Date(schedule.next_run_at) < staleBefore)
      .map((schedule) => `recurring-schedule:${schedule.id}:${new Date(schedule.next_run_at!).toISOString().slice(0, 10)}`),
  ]);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const events = await db.integrationEvent.findMany({
    where: { company_id: user.company_id, type: INCIDENT_TYPE },
    orderBy: { created_at: "desc" },
    select: { id: true, status: true, recipient: true, payload: true, created_at: true },
    take: 1000,
  });

  const timelines = new Map<string, Array<Record<string, unknown>>>();
  for (const event of events) {
    const data = payload(event.payload);
    if (!data.notificationKey) continue;
    const timeline = timelines.get(data.notificationKey) || [];
    timeline.push({ id: event.id, status: data.status || event.status, comment: data.comment || "", changedBy: data.changedBy || event.recipient, changedByName: data.changedByName || "Användare", changedAt: data.changedAt || event.created_at.toISOString() });
    timelines.set(data.notificationKey, timeline);
  }

  const incidents = [...timelines.entries()].map(([notificationKey, timeline]) => ({
    notificationKey,
    status: timeline[0]?.status || "acknowledged",
    latest: timeline[0],
    timeline,
  }));
  return NextResponse.json({ incidents }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as { notificationKey?: unknown; status?: unknown; comment?: unknown };
  const notificationKey = typeof body.notificationKey === "string" ? body.notificationKey.trim() : "";
  const status = typeof body.status === "string" ? body.status as IncidentStatus : "acknowledged";
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (!notificationKey || !["acknowledged", "resolved", "reopened"].includes(status)) return NextResponse.json({ error: "Ogiltig incidentåtgärd" }, { status: 400 });
  if (comment.length > 2000) return NextResponse.json({ error: "Kommentaren är för lång" }, { status: 400 });

  const validKeys = await validIncidentKeys(user.company_id);
  if (!validKeys.has(notificationKey)) return NextResponse.json({ error: "Incidenten finns inte eller tillhör en annan organisation" }, { status: 404 });

  const changedAt = new Date().toISOString();
  const event = await db.integrationEvent.create({
    data: {
      company_id: user.company_id,
      type: INCIDENT_TYPE,
      status,
      recipient: user.id,
      payload: { notificationKey, status, comment, changedBy: user.id, changedByName: user.name || user.email || "Användare", changedAt },
    },
    select: { id: true },
  });
  return NextResponse.json({ success: true, id: event.id, status, changedAt }, { status: 201 });
}
