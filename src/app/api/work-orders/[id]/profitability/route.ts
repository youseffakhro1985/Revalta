import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  getModernProfitabilitySettings,
  getProfitabilitySettings,
  listMaterialEntries,
  listTimeEntries,
  upsertProfitabilitySettings,
} from "@/lib/work-order-ops-storage";

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getOrder(id: string, companyId: string) {
  return db.workOrder.findFirst({
    where: { deleted_at: null, id, company_id: companyId, property: { deleted_at: null } },
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

  const [times, materials, settings] = await Promise.all([
    listTimeEntries(user.company_id, id),
    listMaterialEntries(user.company_id, id),
    getProfitabilitySettings(user.company_id, id),
  ]);

  let approvedMinutes = 0;
  let billableMinutes = 0;
  for (const row of times) {
    if (row.status !== "approved") continue;
    const minutes = numberValue(row.minutes);
    approvedMinutes += minutes;
    if (row.billable === true && row.kind !== "break") billableMinutes += minutes;
  }

  let materialCost = 0;
  let billableMaterial = 0;
  for (const row of materials) {
    if (row.status === "deleted" || row.status === "rejected") continue;
    materialCost += numberValue(row.total);
    if (row.billable === true) billableMaterial += numberValue(row.total);
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
    order: {
      ...order,
      estimated_cost: order.estimated_cost?.toString() ?? null,
      actual_cost: order.actual_cost?.toString() ?? null,
    },
    settings: {
      internalHourlyCost,
      customerHourlyRate,
      materialMarkupPercent,
      otherCost,
      fixedRevenue,
      ...(settings.source ? { source: settings.source } : {}),
    },
    summary: {
      approvedMinutes,
      billableMinutes,
      laborCost,
      laborRevenue,
      materialCost,
      billableMaterial,
      materialRevenue,
      otherCost,
      fixedRevenue,
      totalCost,
      totalRevenue,
      margin,
      marginPercent,
    },
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

  const modern = await getModernProfitabilitySettings(user.company_id, id);
  if (!modern) {
    const existing = await getProfitabilitySettings(user.company_id, id);
    if (existing.source === "legacy") {
      return NextResponse.json({
        error: "Lönsamhetsinställningarna finns kvar i äldre lagring. Kör backfill till WorkOrderProfitabilitySettings innan de kan uppdateras.",
      }, { status: 409 });
    }
  }

  const body = await request.json();
  const settings = {
    internalHourlyCost: numberValue(body.internalHourlyCost),
    customerHourlyRate: numberValue(body.customerHourlyRate),
    materialMarkupPercent: numberValue(body.materialMarkupPercent),
    otherCost: numberValue(body.otherCost),
    fixedRevenue: numberValue(body.fixedRevenue),
  };
  if (
    settings.internalHourlyCost < 0 || settings.internalHourlyCost > 10000
    || settings.customerHourlyRate < 0 || settings.customerHourlyRate > 20000
    || settings.materialMarkupPercent < 0 || settings.materialMarkupPercent > 500
    || settings.otherCost < 0 || settings.otherCost > 100000000
    || settings.fixedRevenue < 0 || settings.fixedRevenue > 100000000
  ) {
    return NextResponse.json({ error: "Ett eller flera belopp ligger utanför tillåtet intervall" }, { status: 400 });
  }

  const saved = await upsertProfitabilitySettings(user.company_id, id, user.id, settings);
  await writeAuditLog(user, {
    entityType: "work_order",
    entityId: id,
    action: "work_order.profitability_updated",
    metadata: { ...settings, storage: "WorkOrderProfitabilitySettings" },
  });
  return NextResponse.json({ settings: { ...saved, source: "table" as const } }, { status: 201 });
}
