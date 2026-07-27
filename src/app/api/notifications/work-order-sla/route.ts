import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser, shouldScopeToAssignedWork } from "@/lib/current-user";
import { evaluateWorkOrderSla } from "@/lib/work-order-sla";
import { buildSlaPriorityQueue } from "@/lib/work-order-sla-priority";
import {
  getNotificationUxState,
  markNotificationsRead,
  snoozeNotifications,
} from "@/lib/notification-ux-state";
import { sqlSoftDeleteGuard } from "@/lib/soft-delete-compat";

export const dynamic = "force-dynamic";

type WorkOrderRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigned_to_id: string | null;
  completed_at: Date | null;
  created_at: Date;
  property_name: string;
  property_address: string;
  property_city: string;
  work_order_number: string | null;
  sla_response_due_at: Date | null;
  sla_resolution_due_at: Date | null;
  responded_at: Date | null;
  paused_at: Date | null;
  pause_reason: string | null;
  closed_at: Date | null;
};

async function rowsFor(companyId: string, assignedToId?: string | null) {
  const [propertyGuard, workOrderGuard] = await Promise.all([
    sqlSoftDeleteGuard(db, "Property", "p"),
    sqlSoftDeleteGuard(db, "WorkOrder", "w"),
  ]);
  return db.$queryRaw<WorkOrderRow[]>(Prisma.sql`
    SELECT w."id", w."title", w."status", w."priority", w."assigned_to_id", w."completed_at", w."created_at",
      p."name" AS "property_name", p."address" AS "property_address", p."city" AS "property_city",
      w."work_order_number", w."sla_response_due_at", w."sla_resolution_due_at", w."responded_at",
      w."paused_at", w."pause_reason", w."closed_at"
    FROM "WorkOrder" w
    INNER JOIN "Property" p ON p."id" = w."property_id" AND p."company_id" = w."company_id"
    WHERE w."company_id" = ${companyId}
      ${propertyGuard}
      ${workOrderGuard}
      AND w."status" NOT IN ('completed', 'invoiced', 'cancelled')
      ${assignedToId ? Prisma.sql`AND w."assigned_to_id" = ${assignedToId}` : Prisma.empty}
    LIMIT 500
  `);
}

function keyFor(id: string, phase: string, dueAt: string | null) {
  return `work-order-sla:${id}:${phase}:${dueAt?.slice(0, 16) || "missing"}`;
}

function descriptionFor(row: WorkOrderRow, risk: string, assigned: boolean) {
  const reference = row.work_order_number || `AO-${row.id.slice(0, 8)}`;
  const riskText = risk === "overdue" ? "SLA är passerad" : risk === "critical" ? "SLA är kritisk" : risk === "soon" ? "SLA förfaller inom 24 timmar" : "SLA-deadline saknas";
  return `${reference} · ${riskText} · ${row.property_name}, ${row.property_address}, ${row.property_city}${assigned ? "" : " · Saknar ansvarig"}`;
}

async function notificationsFor(companyId: string, assignedToId?: string | null) {
  const now = new Date();
  const rows = await rowsFor(companyId, assignedToId);
  const evaluated = rows.map((row) => {
    const sla = evaluateWorkOrderSla({
      status: row.status,
      responseDueAt: row.sla_response_due_at,
      resolutionDueAt: row.sla_resolution_due_at,
      respondedAt: row.responded_at,
      completedAt: row.completed_at,
      closedAt: row.closed_at,
      pausedAt: row.paused_at,
      pauseReason: row.pause_reason,
    }, now);
    return { id: row.id, status: row.status, priority: row.priority, assigned: Boolean(row.assigned_to_id), sla, payload: row };
  });

  return buildSlaPriorityQueue(evaluated, 200).map((item) => {
    const row = item.payload!;
    const dueAt = item.sla.dueAt || row.created_at.toISOString();
    return {
      key: keyFor(row.id, item.sla.phase, item.sla.dueAt),
      title: item.sla.risk === "not_configured" ? `SLA saknas: ${row.title}` : `${item.sla.label}: ${row.title}`,
      description: descriptionFor(row, item.sla.risk, item.assigned),
      dueAt,
      overdue: item.sla.risk === "overdue",
      high: ["overdue", "critical"].includes(item.sla.risk) || row.priority === "urgent",
      risk: item.sla.risk,
      phase: item.sla.phase,
      assigned: item.assigned,
      href: `/dashboard/arbetsorder/${row.id}`,
      kind: "sla" as const,
    };
  });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const filter = new URL(request.url).searchParams.get("filter") || "all";
  const assignedScope = shouldScopeToAssignedWork(user.role) ? user.id : null;
  const [base, ux] = await Promise.all([
    notificationsFor(user.company_id, assignedScope),
    getNotificationUxState(user.company_id, user.id, "work_order_sla"),
  ]);

  const now = new Date();
  const all = base.map((item) => {
    const snoozedUntilRaw = ux.snooze.get(item.key) ?? null;
    const snoozedUntil = snoozedUntilRaw && snoozedUntilRaw > now ? snoozedUntilRaw : null;
    return { ...item, read: ux.read.has(item.key), snoozedUntil: snoozedUntil?.toISOString() || null };
  });
  const active = all.filter((item) => !item.snoozedUntil);
  const notifications = all.filter((item) => {
    if (filter === "snoozed") return Boolean(item.snoozedUntil);
    if (item.snoozedUntil) return false;
    if (filter === "unread") return !item.read;
    if (filter === "overdue") return item.overdue;
    if (filter === "high") return item.high;
    return true;
  });

  return NextResponse.json({ notifications, summary: { total: active.length, unread: active.filter((item) => !item.read).length, overdue: active.filter((item) => item.overdue).length, high: active.filter((item) => item.high).length, snoozed: all.filter((item) => item.snoozedUntil).length } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const body = await request.json().catch(() => ({})) as { key?: unknown; all?: unknown; action?: unknown; snoozedUntil?: unknown };
  const action = typeof body.action === "string" ? body.action : "read";
  const assignedScope = shouldScopeToAssignedWork(user.role) ? user.id : null;
  const current = await notificationsFor(user.company_id, assignedScope);
  const validKeys = new Set(current.map((item) => item.key));
  const keys = body.all === true ? Array.from(validKeys) : [typeof body.key === "string" ? body.key.trim() : ""].filter(Boolean);
  if (!keys.length || keys.some((key) => key.length > 300 || !validKeys.has(key))) return NextResponse.json({ error: "Ogiltig eller obehörig SLA-avisering" }, { status: 400 });

  if (action === "snooze") {
    const until = typeof body.snoozedUntil === "string" ? new Date(body.snoozedUntil) : null;
    const max = new Date(Date.now() + 30 * 86400000);
    if (!until || Number.isNaN(until.getTime()) || until <= new Date() || until > max) return NextResponse.json({ error: "SLA-aviseringen kan skjutas upp högst 30 dagar" }, { status: 400 });
    await snoozeNotifications(user.company_id, user.id, "work_order_sla", keys, until, false);
    return NextResponse.json({ success: true, snoozed: keys.length, snoozedUntil: until.toISOString() });
  }

  if (action === "unsnooze") {
    await snoozeNotifications(user.company_id, user.id, "work_order_sla", keys, null, true);
    return NextResponse.json({ success: true, reactivated: keys.length });
  }
  if (action !== "read") return NextResponse.json({ error: "Ogiltig åtgärd" }, { status: 400 });

  const ux = await getNotificationUxState(user.company_id, user.id, "work_order_sla");
  const missing = Array.from(new Set(keys)).filter((key) => !ux.read.has(key));
  if (missing.length) await markNotificationsRead(user.company_id, user.id, "work_order_sla", missing);
  return NextResponse.json({ success: true, marked: missing.length });
}
