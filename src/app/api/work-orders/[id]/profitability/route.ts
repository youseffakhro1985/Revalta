import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

const SETTINGS_TYPE = "work_order.profitability_settings";
const TIME_TYPE = "work_order.time_entry";
const MATERIAL_TYPE = "work_order.material_entry";

type JsonObject = Record<string, unknown>;
function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}
function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getOrder(id: string, companyId: string) {
  return db.workOrder.findFirst({
    where: { deleted_at: null, id, company_id: companyId },
    select: { id: true, title: true, estimated_cost: true, actual_cost: true },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;
  const order = await getOrder(id, user.company_id);
  if (!order) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const events = await db.integrationEvent.findMany({
    where: { company_id: user.company_id, recipient: id, type: { in: [TIME_TYPE, MATERIAL_TYPE, SETTINGS_TYPE] } },
    orderBy: { created_at: "asc" },
    take: 6000,
  });

  const times = new Map<string, JsonObject>();
  const materials = new Map<string, JsonObject>();
  let settings: JsonObject = {};
  for (const event of events) {
    const payload = asObject(event.payload);
    if (!payload) continue;
    if (event.type === TIME_TYPE && typeof payload.entryId === "string") times.set(payload.entryId, { ...(times.get(payload.entryId) ?? {}), ...payload });
    if (event.type === MATERIAL_TYPE && typeof payload.entryId === "string") materials.set(payload.entryId, { ...(materials.get(payload.entryId) ?? {}), ...payload });
    if (event.type === SETTINGS_TYPE) settings = payload;
  }

  let approvedMinutes = 0;
  let billableMinutes = 0;
  for (const row of times.values()) {
    if (row.status !== "approved") continue;
    const minutes = numberValue(row.minutes);
    approvedMinutes += minutes;
    if (row.billable === true && row.kind !== "break") billableMinutes += minutes;
  }

  let materialCost = 0;
  let billableMaterial = 0;
  for (const row of materials.values()) {
    if (row.status === "deleted" || row.status === "rejected") continue;
    const total = numberValue(row.total);
    materialCost += total;
    if (row.billable === true) billableMaterial += total;
  }

  const internalHourlyCost = numberValue(settings.internalHourlyCost, 350);
  const customerHourlyRate = numberValue(settings.customerHourlyRate, 650);
  const materialMarkupPercent = numberValue(settings.materialMarkupPercent, 15);
  const otherCost = numberValue(settings.otherCost, 0);
  const fixedRevenue = numberValue(settings.fixedRevenue, 0);
  const laborCost = Math.round((approvedMinutes / 60) * internalHourlyCost * 100) / 100;
  const laborRevenue = Math.round((billableMinutes / 60) * customerHourlyRate * 100) / 100;
  const materialRevenue = Math.round(billableMaterial * (1 + materialMarkupPercent / 100) * 100) / 100;
  const totalCost = Math.round((laborCost + materialCost + otherCost) * 100) / 100;
  const totalRevenue = Math.round((laborRevenue + materialRevenue + fixedRevenue) * 100) / 100;
  const margin = Math.round((totalRevenue - totalCost) * 100) / 100;
  const marginPercent = totalRevenue > 0 ? Math.round((margin / totalRevenue) * 1000) / 10 : 0;

  return NextResponse.json({
    order: { ...order, estimated_cost: order.estimated_cost?.toString() ?? null, actual_cost: order.actual_cost?.toString() ?? null },
    settings: { internalHourlyCost, customerHourlyRate, materialMarkupPercent, otherCost, fixedRevenue },
    summary: { approvedMinutes, billableMinutes, laborCost, laborRevenue, materialCost, billableMaterial, materialRevenue, otherCost, fixedRevenue, totalCost, totalRevenue, margin, marginPercent },
    canManage: canManageTickets(user.role),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  const { id } = await params;
  if (!(await getOrder(id, user.company_id))) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });
  const body = await request.json();
  const settings = {
    internalHourlyCost: numberValue(body.internalHourlyCost),
    customerHourlyRate: numberValue(body.customerHourlyRate),
    materialMarkupPercent: numberValue(body.materialMarkupPercent),
    otherCost: numberValue(body.otherCost),
    fixedRevenue: numberValue(body.fixedRevenue),
    updatedById: user.id,
    updatedAt: new Date().toISOString(),
  };
  if (settings.internalHourlyCost < 0 || settings.internalHourlyCost > 10000 || settings.customerHourlyRate < 0 || settings.customerHourlyRate > 20000 || settings.materialMarkupPercent < 0 || settings.materialMarkupPercent > 500 || settings.otherCost < 0 || settings.otherCost > 100000000 || settings.fixedRevenue < 0 || settings.fixedRevenue > 100000000) {
    return NextResponse.json({ error: "Ett eller flera belopp ligger utanför tillåtet intervall" }, { status: 400 });
  }
  await db.integrationEvent.create({ data: { company_id: user.company_id, type: SETTINGS_TYPE, status: "saved", recipient: id, payload: settings } });
  await writeAuditLog(user, { entityType: "work_order", entityId: id, action: "work_order.profitability_updated", metadata: settings });
  return NextResponse.json({ settings }, { status: 201 });
}
