import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  getModernTimeEntry,
  getTimeEntry,
  listTimeEntries,
  upsertTimeEntry,
  type TimeEntryPayload,
} from "@/lib/work-order-ops-storage";

const allowedKinds = new Set(["work", "travel", "break"]);
const allowedActions = new Set(["manual", "start", "stop", "approve", "reject"]);

async function ensureOrder(id: string, companyId: string) {
  return db.workOrder.findFirst({ where: { deleted_at: null, id, company_id: companyId }, select: { id: true, title: true } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;
  if (!(await ensureOrder(id, user.company_id))) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const rows = (await listTimeEntries(user.company_id, id))
    .sort((a, b) => String(b.startedAt ?? b.createdAt).localeCompare(String(a.startedAt ?? a.createdAt)));
  const summary = rows.reduce((acc, row) => {
    const minutes = row.minutes ?? (row.startedAt && row.endedAt ? Math.max(0, Math.round((new Date(row.endedAt).getTime() - new Date(row.startedAt).getTime()) / 60000)) : 0);
    if (row.kind === "work") acc.work += minutes;
    if (row.kind === "travel") acc.travel += minutes;
    if (row.kind === "break") acc.break += minutes;
    if (row.billable && row.kind !== "break") acc.billable += minutes;
    if (row.status === "running") acc.running += 1;
    if (row.status === "submitted") acc.pending += 1;
    return acc;
  }, { work: 0, travel: 0, break: 0, billable: 0, running: 0, pending: 0 });

  return NextResponse.json({ entries: rows, summary, canManage: canManageTickets(user.role) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;
  const order = await ensureOrder(id, user.company_id);
  if (!order) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const body = await request.json();
  const action = String(body.action || "manual");
  const kind = String(body.kind || "work");
  if (!allowedActions.has(action) || !allowedKinds.has(kind)) return NextResponse.json({ error: "Ogiltig åtgärd eller tidstyp" }, { status: 400 });
  if (["approve", "reject"].includes(action) && !canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet att attestera tid" }, { status: 403 });

  const entryId = String(body.entryId || crypto.randomUUID());
  const note = body.note ? String(body.note).trim().slice(0, 1000) : null;
  const billable = kind !== "break" && body.billable !== false;
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  let minutes: number | null = null;
  let status: TimeEntryPayload["status"] = "submitted";
  let userId = user.id;
  let userName = user.name;
  let userEmail = user.email;

  if (action === "start") {
    startedAt = new Date().toISOString();
    status = "running";
  } else if (action === "manual") {
    const start = new Date(String(body.startedAt || ""));
    const end = new Date(String(body.endedAt || ""));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return NextResponse.json({ error: "Start- och sluttid måste vara giltiga" }, { status: 400 });
    if (end.getTime() - start.getTime() > 24 * 60 * 60 * 1000) return NextResponse.json({ error: "En tidsrad får vara högst 24 timmar" }, { status: 400 });
    startedAt = start.toISOString(); endedAt = end.toISOString(); minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  } else {
    const modern = await getModernTimeEntry(user.company_id, id, entryId);
    const latest = modern ?? await getTimeEntry(user.company_id, id, entryId);
    if (!latest) return NextResponse.json({ error: "Tidsraden hittades inte" }, { status: 404 });
    if (!modern) {
      return NextResponse.json({
        error: "Tidsraden finns kvar i äldre lagring. Kör backfill till WorkOrderTimeEntry innan den kan uppdateras.",
      }, { status: 409 });
    }
    userId = latest.userId;
    userName = latest.userName ?? null;
    userEmail = latest.userEmail;
    if (action === "stop") {
      if (latest.userId !== user.id && !canManageTickets(user.role)) return NextResponse.json({ error: "Du kan bara stoppa din egen timer" }, { status: 403 });
      if (!latest.startedAt || latest.status !== "running") return NextResponse.json({ error: "Tidsraden är inte aktiv" }, { status: 400 });
      startedAt = latest.startedAt; endedAt = new Date().toISOString(); minutes = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000)); status = "submitted";
    } else {
      startedAt = latest.startedAt ?? null; endedAt = latest.endedAt ?? null; minutes = latest.minutes ?? null; status = action === "approve" ? "approved" : "rejected";
    }
  }

  const payload: TimeEntryPayload = {
    entryId,
    workOrderId: id,
    userId,
    userName,
    userEmail,
    kind: kind as TimeEntryPayload["kind"],
    action: action as TimeEntryPayload["action"],
    startedAt,
    endedAt,
    minutes,
    billable,
    note,
    status,
    actorId: user.id,
  };
  const entry = await upsertTimeEntry(user.company_id, payload);
  await writeAuditLog(user, {
    entityType: "work_order",
    entityId: id,
    action: `work_order.time_${action}`,
    metadata: { entryId, kind, minutes, billable, status, storage: "WorkOrderTimeEntry" },
  });
  return NextResponse.json({ entry }, { status: 201 });
}
