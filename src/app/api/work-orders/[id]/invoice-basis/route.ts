import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageWorkOrderFinance, canViewFinanceData, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  createInvoiceDraft,
  getLatestInvoiceDraft,
  getProfitabilitySettings,
  listMaterialEntries,
  listTimeEntries,
  type InvoiceDraftPayload,
} from "@/lib/work-order-ops-storage";

const statuses = new Set(["draft", "ready", "exported", "cancelled"]);

type Line = {
  id: string;
  type: "labor" | "material" | "other";
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function round(value: number) {
  return Math.round(value * 100) / 100;
}
function cleanLine(value: unknown): Line | null {
  const row = object(value);
  if (!row) return null;
  const description = String(row.description ?? "").trim().slice(0, 300);
  const type = String(row.type ?? "other") as Line["type"];
  const quantity = num(row.quantity);
  const unitPrice = num(row.unitPrice);
  if (!description || !["labor", "material", "other"].includes(type) || quantity <= 0 || quantity > 100000 || unitPrice < 0 || unitPrice > 10000000) return null;
  return {
    id: typeof row.id === "string" ? row.id : crypto.randomUUID(),
    type,
    description,
    quantity,
    unit: String(row.unit ?? "st").trim().slice(0, 30) || "st",
    unitPrice,
    total: round(quantity * unitPrice),
  };
}

async function order(id: string, companyId: string) {
  return db.workOrder.findFirst({
    where: { deleted_at: null, id, company_id: companyId, property: { deleted_at: null } },
    select: {
      id: true,
      title: true,
      status: true,
      property: { select: { name: true, address: true, postal_code: true, city: true } },
      unit: { select: { designation: true } },
      company: { select: { name: true, org_number: true } },
    },
  });
}

async function sourceData(id: string, companyId: string) {
  const [times, materials, profit, saved] = await Promise.all([
    listTimeEntries(companyId, id),
    listMaterialEntries(companyId, id),
    getProfitabilitySettings(companyId, id),
    getLatestInvoiceDraft(companyId, id),
  ]);

  let billableMinutes = 0;
  for (const row of times) {
    if (row.status === "approved" && row.billable === true && row.kind !== "break") billableMinutes += num(row.minutes);
  }
  let billableMaterial = 0;
  for (const row of materials) {
    if (row.status !== "deleted" && row.status !== "rejected" && row.billable === true) billableMaterial += num(row.total);
  }

  return {
    billableMinutes,
    billableMaterial,
    hourlyRate: num(profit.customerHourlyRate, 650),
    materialMarkup: num(profit.materialMarkupPercent, 15),
    fixedRevenue: num(profit.fixedRevenue),
    saved,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canViewFinanceData(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att visa faktureringsunderlag" }, { status: 403 });
  }
  const { id } = await params;
  const workOrder = await order(id, user.company_id);
  if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const source = await sourceData(id, user.company_id);
  const generated: Line[] = [];
  if (source.billableMinutes > 0) {
    generated.push({
      id: crypto.randomUUID(),
      type: "labor",
      description: "Arbete enligt arbetsorder",
      quantity: round(source.billableMinutes / 60),
      unit: "tim",
      unitPrice: source.hourlyRate,
      total: round((source.billableMinutes / 60) * source.hourlyRate),
    });
  }
  if (source.billableMaterial > 0) {
    const amount = round(source.billableMaterial * (1 + source.materialMarkup / 100));
    generated.push({
      id: crypto.randomUUID(),
      type: "material",
      description: "Material enligt arbetsorder",
      quantity: 1,
      unit: "st",
      unitPrice: amount,
      total: amount,
    });
  }
  if (source.fixedRevenue > 0) {
    generated.push({
      id: crypto.randomUUID(),
      type: "other",
      description: "Fast ersättning",
      quantity: 1,
      unit: "st",
      unitPrice: source.fixedRevenue,
      total: source.fixedRevenue,
    });
  }

  const draft = source.saved
    ? {
      ...source.saved,
      lines: Array.isArray(source.saved.lines) ? source.saved.lines : [],
      ...(source.saved.source ? { source: source.saved.source } : {}),
    }
    : {
      status: "draft",
      customerName: "",
      customerOrgNumber: "",
      customerReference: "",
      invoiceDate: new Date().toISOString().slice(0, 10),
      dueDays: 30,
      discountPercent: 0,
      vatPercent: 25,
      note: "",
      lines: generated,
    };

  return NextResponse.json({
    workOrder,
    draft,
    source: { billableMinutes: source.billableMinutes, billableMaterial: source.billableMaterial },
    canManage: canManageWorkOrderFinance(user.role),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageWorkOrderFinance(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  const { id } = await params;
  if (!(await order(id, user.company_id))) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const body = await request.json();
  const status = String(body.status ?? "draft");
  if (!statuses.has(status)) return NextResponse.json({ error: "Ogiltig status" }, { status: 400 });
  if (!Array.isArray(body.lines) || body.lines.length > 100) return NextResponse.json({ error: "Fakturarader saknas eller är för många" }, { status: 400 });
  const lines = body.lines.map(cleanLine);
  if (lines.some((line: Line | null) => !line)) return NextResponse.json({ error: "En eller flera fakturarader är ogiltiga" }, { status: 400 });
  const validLines = lines as Line[];
  const discountPercent = num(body.discountPercent);
  const vatPercent = num(body.vatPercent, 25);
  const dueDays = Math.round(num(body.dueDays, 30));
  if (discountPercent < 0 || discountPercent > 100 || vatPercent < 0 || vatPercent > 100 || dueDays < 0 || dueDays > 365) {
    return NextResponse.json({ error: "Rabatt, moms eller betalningsvillkor är ogiltigt" }, { status: 400 });
  }

  const subtotal = round(validLines.reduce((sum, line) => sum + line.total, 0));
  const discount = round(subtotal * discountPercent / 100);
  const net = round(subtotal - discount);
  const vat = round(net * vatPercent / 100);
  const total = round(net + vat);
  const payload: InvoiceDraftPayload = {
    versionId: crypto.randomUUID(),
    workOrderId: id,
    status,
    customerName: String(body.customerName ?? "").trim().slice(0, 200),
    customerOrgNumber: String(body.customerOrgNumber ?? "").trim().slice(0, 50),
    customerReference: String(body.customerReference ?? "").trim().slice(0, 200),
    invoiceDate: String(body.invoiceDate ?? new Date().toISOString().slice(0, 10)),
    dueDays,
    discountPercent,
    vatPercent,
    note: String(body.note ?? "").trim().slice(0, 2000),
    lines: validLines,
    subtotal,
    discount,
    net,
    vat,
    total,
    updatedById: user.id,
    updatedAt: new Date().toISOString(),
  };

  const draft = await createInvoiceDraft(user.company_id, payload);
  await writeAuditLog(user, {
    entityType: "work_order",
    entityId: id,
    action: `work_order.invoice_basis_${status}`,
    metadata: { versionId: payload.versionId, subtotal, vat, total, lineCount: validLines.length, storage: "WorkOrderInvoiceDraft" },
  });
  return NextResponse.json({ draft }, { status: 201 });
}
