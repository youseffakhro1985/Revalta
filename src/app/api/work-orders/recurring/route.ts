import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  generateRecurringWorkOrder,
  readRecurringSchedules,
  RECURRING_FREQUENCIES,
  RECURRING_PRIORITIES,
  RECURRING_SCHEDULE_ACTION,
  type RecurringFrequency,
  type RecurringPriority,
} from "@/lib/recurring-work-order-engine";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const [schedules, properties] = await Promise.all([
    readRecurringSchedules(user.company_id),
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
    if (!scheduleId) return NextResponse.json({ error: "Schema krävs" }, { status: 400 });
    const result = await generateRecurringWorkOrder({ companyId: user.company_id, scheduleId, actorUserId: user.id, force: true });
    if (result.status === "generated") return NextResponse.json(result, { status: 201 });
    if (result.status === "locked") return NextResponse.json({ error: "Schemat körs redan" }, { status: 409 });
    if (result.status === "failed") return NextResponse.json({ error: "Schemat kunde inte generera en arbetsorder", reason: result.reason }, { status: 400 });
    return NextResponse.json({ error: "Aktivt schema hittades inte" }, { status: 404 });
  }

  const propertyId = String(body.propertyId || "").trim();
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const frequency = String(body.frequency || "") as RecurringFrequency;
  const priority = String(body.priority || "normal") as RecurringPriority;
  const nextRunAt = new Date(String(body.nextRunAt || ""));
  const estimatedCost = body.estimatedCost === "" || body.estimatedCost == null ? null : Number(body.estimatedCost);

  if (!propertyId || !title || !description || !RECURRING_FREQUENCIES.includes(frequency) || !RECURRING_PRIORITIES.includes(priority) || Number.isNaN(nextRunAt.getTime())) {
    return NextResponse.json({ error: "Kontrollera fastighet, innehåll, frekvens, prioritet och nästa körning" }, { status: 400 });
  }
  if (title.length > 180 || description.length > 10000 || (estimatedCost !== null && (!Number.isFinite(estimatedCost) || estimatedCost < 0))) {
    return NextResponse.json({ error: "Rubrik, beskrivning eller kostnad är ogiltig" }, { status: 400 });
  }

  const property = await db.property.findFirst({ where: { id: propertyId, company_id: user.company_id }, select: { id: true, name: true } });
  if (!property) return NextResponse.json({ error: "Fastigheten hittades inte" }, { status: 404 });

  const scheduleId = randomUUID();
  await writeAuditLog(user, {
    entityType: "recurring_work_order",
    entityId: scheduleId,
    action: RECURRING_SCHEDULE_ACTION,
    metadata: {
      schedule_id: scheduleId,
      property_id: property.id,
      property_name: property.name,
      title,
      description,
      frequency,
      priority,
      estimated_cost: estimatedCost,
      next_run_at: nextRunAt.toISOString(),
      active: true,
      last_generated_at: null,
      last_work_order_id: null,
      last_work_order_number: null,
      updated_at: new Date().toISOString(),
    },
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

  const schedules = await readRecurringSchedules(user.company_id);
  const schedule = schedules.find((item) => item.id === scheduleId);
  if (!schedule) return NextResponse.json({ error: "Schemat hittades inte" }, { status: 404 });

  await writeAuditLog(user, {
    entityType: "recurring_work_order",
    entityId: scheduleId,
    action: RECURRING_SCHEDULE_ACTION,
    metadata: { ...schedule, schedule_id: scheduleId, active: body.active, updated_at: new Date().toISOString() },
  });
  return NextResponse.json({ success: true });
}
