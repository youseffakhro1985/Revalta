import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  normalizeWorkOrderPriority,
  normalizeWorkOrderStatus,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
} from "@/lib/work-order-workflow";

function parseOptionalDate(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseOptionalMoney(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

const include = {
  property: { select: { id: true, name: true, address: true, city: true } },
  unit: { select: { id: true, designation: true, unit_type: true } },
  ticket: { select: { id: true, public_reference: true, title: true } },
  assigned_to: { select: { id: true, name: true, email: true } },
  created_by: { select: { id: true, name: true, email: true } },
  projects: { select: { id: true, name: true, status: true } },
  comments: {
    orderBy: { created_at: "desc" as const },
    take: 100,
    include: { user: { select: { id: true, name: true, email: true } } },
  },
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const [workOrder, users] = await Promise.all([
    db.workOrder.findFirst({ where: { id, company_id: user.company_id }, include }),
    db.user.findMany({
      where: { company_id: user.company_id, status: "active" },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });
  return NextResponse.json({ workOrder, users, canManage: canManageTickets(user.role) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const { id } = await params;
  const existing = await db.workOrder.findFirst({
    where: { id, company_id: user.company_id },
    select: { id: true, status: true, scheduled_start: true, scheduled_end: true },
  });
  if (!existing) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Ogiltigt innehåll" }, { status: 400 });

  const data: {
    title?: string; description?: string; status?: string; priority?: string;
    assigned_to_id?: string | null; scheduled_start?: Date | null; scheduled_end?: Date | null;
    estimated_cost?: number | null; actual_cost?: number | null; completed_at?: Date | null;
  } = {};

  if (body.title !== undefined) { const value = String(body.title).trim(); if (!value) return NextResponse.json({ error: "Rubrik får inte vara tom" }, { status: 400 }); data.title = value; }
  if (body.description !== undefined) { const value = String(body.description).trim(); if (!value) return NextResponse.json({ error: "Beskrivning får inte vara tom" }, { status: 400 }); data.description = value; }
  if (body.status !== undefined) {
    const raw = String(body.status).trim();
    if (!WORK_ORDER_STATUSES.includes(raw as never)) return NextResponse.json({ error: "Ogiltig status" }, { status: 400 });
    const value = normalizeWorkOrderStatus(raw);
    data.status = value;
    data.completed_at = value === "completed" || value === "invoiced" ? new Date() : null;
  }
  if (body.priority !== undefined) {
    const raw = String(body.priority).trim();
    if (!WORK_ORDER_PRIORITIES.includes(raw as never)) return NextResponse.json({ error: "Ogiltig prioritet" }, { status: 400 });
    data.priority = normalizeWorkOrderPriority(raw);
  }
  if (body.assignedToId !== undefined) {
    const assignedToId = body.assignedToId ? String(body.assignedToId).trim() : null;
    if (assignedToId) {
      const assignee = await db.user.findFirst({ where: { id: assignedToId, company_id: user.company_id, status: "active" }, select: { id: true } });
      if (!assignee) return NextResponse.json({ error: "Ansvarig användare hittades inte" }, { status: 400 });
    }
    data.assigned_to_id = assignedToId;
  }
  if (body.scheduledStart !== undefined) { const value = parseOptionalDate(body.scheduledStart); if (value === undefined) return NextResponse.json({ error: "Ogiltigt startdatum" }, { status: 400 }); data.scheduled_start = value; }
  if (body.scheduledEnd !== undefined) { const value = parseOptionalDate(body.scheduledEnd); if (value === undefined) return NextResponse.json({ error: "Ogiltigt slutdatum" }, { status: 400 }); data.scheduled_end = value; }
  const finalStart = data.scheduled_start !== undefined ? data.scheduled_start : existing.scheduled_start;
  const finalEnd = data.scheduled_end !== undefined ? data.scheduled_end : existing.scheduled_end;
  if (finalStart && finalEnd && finalEnd <= finalStart) return NextResponse.json({ error: "Sluttiden måste ligga efter starttiden" }, { status: 400 });
  if (body.estimatedCost !== undefined) { const value = parseOptionalMoney(body.estimatedCost); if (value === undefined) return NextResponse.json({ error: "Ogiltig beräknad kostnad" }, { status: 400 }); data.estimated_cost = value; }
  if (body.actualCost !== undefined) { const value = parseOptionalMoney(body.actualCost); if (value === undefined) return NextResponse.json({ error: "Ogiltig faktisk kostnad" }, { status: 400 }); data.actual_cost = value; }

  const workOrder = await db.workOrder.update({ where: { id: existing.id }, data, include });
  await writeAuditLog(user, {
    entityType: "work_order", entityId: workOrder.id, action: "work_order.updated",
    metadata: { previousStatus: existing.status, status: workOrder.status, assignedToId: workOrder.assigned_to_id, estimatedCost: workOrder.estimated_cost?.toString() ?? null, actualCost: workOrder.actual_cost?.toString() ?? null },
  });
  return NextResponse.json({ workOrder });
}
