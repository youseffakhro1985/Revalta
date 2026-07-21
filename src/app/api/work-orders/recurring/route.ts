import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  addWorkOrderStatusEvent,
  allocateWorkOrderNumber,
  calculateWorkOrderSla,
  setWorkOrderEnterpriseFields,
} from "@/lib/work-order-enterprise-core";

const scheduleAction = "work_order.recurring.schedule";
const allowedFrequencies = ["weekly", "monthly", "quarterly", "yearly"] as const;
const allowedPriorities = ["low", "normal", "high", "urgent"] as const;
type Frequency = (typeof allowedFrequencies)[number];
type Priority = (typeof allowedPriorities)[number];
type ScheduleMetadata = {
  schedule_id?: string;
  property_id?: string;
  property_name?: string;
  title?: string;
  description?: string;
  frequency?: Frequency;
  priority?: Priority;
  estimated_cost?: number | null;
  next_run_at?: string;
  active?: boolean;
  last_generated_at?: string | null;
  last_work_order_id?: string | null;
  last_work_order_number?: string | null;
  updated_at?: string;
};

function advance(date: Date, frequency: Frequency) {
  const next = new Date(date);
  if (frequency === "weekly") next.setDate(next.getDate() + 7);
  if (frequency === "monthly") next.setMonth(next.getMonth() + 1);
  if (frequency === "quarterly") next.setMonth(next.getMonth() + 3);
  if (frequency === "yearly") next.setFullYear(next.getFullYear() + 1);
  return next;
}

async function readSchedules(companyId: string) {
  const logs = await db.auditLog.findMany({
    where: { company_id: companyId, action: scheduleAction },
    orderBy: { created_at: "asc" },
    select: { id: true, metadata: true, created_at: true },
  });
  const latest = new Map<string, Record<string, unknown>>();
  for (const log of logs) {
    const metadata = (log.metadata ?? {}) as ScheduleMetadata;
    const id = metadata.schedule_id || log.id;
    latest.set(id, {
      ...(latest.get(id) || {}),
      ...metadata,
      id,
      created_at: latest.get(id)?.created_at || log.created_at,
      updated_at: metadata.updated_at || log.created_at,
    });
  }
  return [...latest.values()];
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const [schedules, properties] = await Promise.all([
    readSchedules(user.company_id),
    db.property.findMany({
      where: { company_id: user.company_id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, address: true, city: true },
    }),
  ]);
  return NextResponse.json({ schedules, properties }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Ogiltigt innehåll" }, { status: 400 });

  if (body.action === "generate") {
    const scheduleId = String(body.scheduleId || "").trim();
    const schedules = await readSchedules(user.company_id);
    const schedule = schedules.find((item) => item.id === scheduleId) as (ScheduleMetadata & { id: string }) | undefined;
    if (!schedule || !schedule.active) return NextResponse.json({ error: "Aktivt schema hittades inte" }, { status: 404 });
    if (!schedule.property_id || !schedule.title || !schedule.description || !schedule.frequency || !schedule.priority || !schedule.next_run_at) {
      return NextResponse.json({ error: "Schemat saknar obligatoriska uppgifter" }, { status: 400 });
    }

    const property = await db.property.findFirst({ where: { id: schedule.property_id, company_id: user.company_id }, select: { id: true } });
    if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

    const scheduledStart = new Date(schedule.next_run_at);
    const scheduledEnd = new Date(scheduledStart.getTime() + 60 * 60 * 1000);
    const createdAt = new Date();
    const sla = calculateWorkOrderSla(createdAt, schedule.priority);
    const workOrder = await db.$transaction(async (tx) => {
      const workOrderNumber = await allocateWorkOrderNumber(tx, user.company_id!, createdAt);
      const created = await tx.workOrder.create({
        data: {
          company_id: user.company_id!, property_id: schedule.property_id!, created_by_id: user.id,
          title: schedule.title!, description: schedule.description!, status: "planned", priority: schedule.priority!,
          scheduled_start: scheduledStart, scheduled_end: scheduledEnd, estimated_cost: schedule.estimated_cost ?? null,
        },
      });
      await setWorkOrderEnterpriseFields(tx, {
        workOrderId: created.id, companyId: user.company_id!, workOrderNumber,
        workType: "preventive", source: "internal", responseDueAt: sla.responseDueAt, resolutionDueAt: sla.resolutionDueAt,
      });
      await addWorkOrderStatusEvent(tx, {
        companyId: user.company_id!, workOrderId: created.id, actorUserId: user.id,
        fromStatus: null, toStatus: "planned", reason: "Genererad från återkommande schema",
        metadata: { scheduleId, frequency: schedule.frequency },
      });
      return { ...created, workOrderNumber };
    });

    const nextRunAt = advance(scheduledStart, schedule.frequency);
    await writeAuditLog(user, {
      entityType: "recurring_work_order", entityId: scheduleId, action: scheduleAction,
      metadata: { ...schedule, schedule_id: scheduleId, next_run_at: nextRunAt.toISOString(), last_generated_at: createdAt.toISOString(), last_work_order_id: workOrder.id, last_work_order_number: workOrder.workOrderNumber, updated_at: createdAt.toISOString() },
    });
    await writeAuditLog(user, {
      entityType: "work_order", entityId: workOrder.id, action: "work_order.generated_from_recurring_schedule",
      metadata: { scheduleId, workOrderNumber: workOrder.workOrderNumber, nextRunAt: nextRunAt.toISOString() },
    });
    return NextResponse.json({ workOrderId: workOrder.id, workOrderNumber: workOrder.workOrderNumber, nextRunAt }, { status: 201 });
  }

  const propertyId = String(body.propertyId || "").trim();
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const frequency = String(body.frequency || "") as Frequency;
  const priority = String(body.priority || "normal") as Priority;
  const nextRunAt = new Date(String(body.nextRunAt || ""));
  const estimatedCost = body.estimatedCost === "" || body.estimatedCost == null ? null : Number(body.estimatedCost);
  if (!propertyId || !title || !description || !allowedFrequencies.includes(frequency) || !allowedPriorities.includes(priority) || Number.isNaN(nextRunAt.getTime())) {
    return NextResponse.json({ error: "Kontrollera fastighet, innehåll, frekvens, prioritet och nästa körning" }, { status: 400 });
  }
  if (title.length > 180 || description.length > 10000 || (estimatedCost !== null && (!Number.isFinite(estimatedCost) || estimatedCost < 0))) {
    return NextResponse.json({ error: "Rubrik, beskrivning eller kostnad är ogiltig" }, { status: 400 });
  }
  const property = await db.property.findFirst({ where: { id: propertyId, company_id: user.company_id }, select: { id: true, name: true } });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  const scheduleId = randomUUID();
  await writeAuditLog(user, {
    entityType: "recurring_work_order", entityId: scheduleId, action: scheduleAction,
    metadata: { schedule_id: scheduleId, property_id: property.id, property_name: property.name, title, description, frequency, priority, estimated_cost: estimatedCost, next_run_at: nextRunAt.toISOString(), active: true, last_generated_at: null, last_work_order_id: null, last_work_order_number: null, updated_at: new Date().toISOString() },
  });
  return NextResponse.json({ scheduleId }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const body = await request.json().catch(() => null);
  const scheduleId = String(body?.scheduleId || "").trim();
  if (!scheduleId || typeof body?.active !== "boolean") return NextResponse.json({ error: "Schema och aktiv status krävs" }, { status: 400 });
  const schedules = await readSchedules(user.company_id);
  const schedule = schedules.find((item) => item.id === scheduleId) as (ScheduleMetadata & { id: string }) | undefined;
  if (!schedule) return NextResponse.json({ error: "Schemat hittades inte" }, { status: 404 });
  await writeAuditLog(user, {
    entityType: "recurring_work_order", entityId: scheduleId, action: scheduleAction,
    metadata: { ...schedule, schedule_id: scheduleId, active: body.active, updated_at: new Date().toISOString() },
  });
  return NextResponse.json({ success: true });
}
