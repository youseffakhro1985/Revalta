import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageWorkOrderFinance, canViewFinanceData, getCurrentUser, requireCompanyUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  createInvoiceDraft,
  getLatestInvoiceDraft,
  getProfitabilitySettings,
  listMaterialEntries,
  listTimeEntries,
  type InvoiceDraftPayload,
} from "@/lib/work-order-ops-storage";
import { API_ERROR_CODES } from "@/lib/api-error-response";
import {
  isMissingSchemaColumnError,
  isMissingTableError,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";

const clientWritableStatuses = new Set(["draft", "ready", "cancelled"]);

function schemaUnavailable() {
  return NextResponse.json(
    { error: schemaMismatchUserMessage(), errorCode: API_ERROR_CODES.serviceUnavailable },
    { status: 503 },
  );
}

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
    if (row.status === "approved" && row.billable === true) billableMaterial += num(row.total);
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

function linesFromApproved(source: Awaited<ReturnType<typeof sourceData>>): Line[] {
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
  return generated;
}

function totalsFor(lines: Line[], discountPercent: number, vatPercent: number) {
  const subtotal = round(lines.reduce((sum, line) => sum + line.total, 0));
  const discount = round(subtotal * discountPercent / 100);
  const net = round(subtotal - discount);
  const vat = round(net * vatPercent / 100);
  const total = round(net + vat);
  return { subtotal, discount, net, vat, total };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rawUser = await getCurrentUser();
  if (!rawUser) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const user = requireCompanyUser(rawUser);
  if (!user) return NextResponse.json({ error: "En aktiv organisation och personalbehörighet krävs" }, { status: 403 });
  if (!canViewFinanceData(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att visa faktureringsunderlag" }, { status: 403 });
  }
  const { id } = await params;

  try {
    const workOrder = await order(id, user.company_id);
    if (!workOrder) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

    const source = await sourceData(id, user.company_id);
    const generated = linesFromApproved(source);
    const persistedLines = Array.isArray(source.saved?.lines) ? source.saved.lines : [];

    const draft = source.saved
      ? {
        ...source.saved,
        lines: persistedLines,
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
      canBuildFromApproved: generated.length > 0,
      hasPersistedDraft: Boolean(source.saved),
      canManage: canManageWorkOrderFinance(user.role),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (isMissingSchemaColumnError(error) || isMissingTableError(error)) return schemaUnavailable();
    throw error;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rawUser = await getCurrentUser();
  if (!rawUser) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const user = requireCompanyUser(rawUser);
  if (!user) return NextResponse.json({ error: "En aktiv organisation och personalbehörighet krävs" }, { status: 403 });
  if (!canManageWorkOrderFinance(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  const companyId = user.company_id;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Ogiltigt innehåll" }, { status: 400 });
  }

  try {
    if (!(await order(id, companyId))) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

    if (String(body.action ?? "") === "rebuild") {
    const source = await sourceData(id, companyId);
    const locked = String(source.saved?.status ?? "");
    if (locked === "ready" || locked === "exported") {
      return NextResponse.json({
        error: "Ett klart eller exporterat underlag kan inte byggas om. Spara det som utkast först om raderna ska räknas om från attestering.",
      }, { status: 409 });
    }
    const validLines = linesFromApproved(source);
    if (validLines.length === 0) {
      return NextResponse.json({
        error: "Inga attesterade tid- eller materialrader finns. Godkänn rader under Ekonomi och fakturering först.",
      }, { status: 409 });
    }
    const discountPercent = num(source.saved?.discountPercent);
    const vatPercent = num(source.saved?.vatPercent, 25);
    const dueDays = Math.round(num(source.saved?.dueDays, 30));
    const { subtotal, discount, net, vat, total } = totalsFor(validLines, discountPercent, vatPercent);
    const payload: InvoiceDraftPayload = {
      versionId: crypto.randomUUID(),
      workOrderId: id,
      status: "draft",
      customerName: String(source.saved?.customerName ?? "").trim().slice(0, 200),
      customerOrgNumber: String(source.saved?.customerOrgNumber ?? "").trim().slice(0, 50),
      customerReference: String(source.saved?.customerReference ?? "").trim().slice(0, 200),
      invoiceDate: String(source.saved?.invoiceDate ?? new Date().toISOString().slice(0, 10)),
      dueDays,
      discountPercent,
      vatPercent,
      note: String(source.saved?.note ?? "").trim().slice(0, 2000),
      lines: validLines,
      subtotal,
      discount,
      net,
      vat,
      total,
      updatedById: user.id,
      updatedAt: new Date().toISOString(),
    };
    const draft = await db.$transaction(async (tx) => {
      const persistedDraft = await createInvoiceDraft(companyId, payload, tx);
      await writeAuditLog(user, {
        entityType: "work_order",
        entityId: id,
        action: "work_order.invoice_basis_rebuilt",
        metadata: { versionId: payload.versionId, subtotal, vat, total, lineCount: validLines.length, storage: "WorkOrderInvoiceDraft" },
      }, tx);
      return persistedDraft;
    });
    return NextResponse.json({ draft }, { status: 201 });
  }

  if (String(body.action ?? "") === "markReady") {
    const source = await sourceData(id, companyId);
    const saved = source.saved;
    if (!saved) {
      return NextResponse.json({
        error: "Bygg fakturaunderlaget från attesterade rader innan det kan markeras som klart.",
      }, { status: 409 });
    }
    if (saved.source === "legacy") {
      return NextResponse.json({
        error: "Underlaget finns kvar i äldre lagring. Kör backfill innan det kan markeras som klart.",
      }, { status: 409 });
    }
    const locked = String(saved.status ?? "");
    if (locked === "ready" || locked === "exported") {
      return NextResponse.json({
        error: "Ett klart eller exporterat underlag kan inte markeras som klart igen.",
      }, { status: 409 });
    }
    const persistedLines = (Array.isArray(saved.lines) ? saved.lines : []).map(cleanLine);
    if (persistedLines.some((line) => !line) || persistedLines.length === 0) {
      return NextResponse.json({
        error: "Underlaget saknar rader. Bygg det från attesterade rader först.",
      }, { status: 409 });
    }
    const validLines = persistedLines as Line[];
    const customerName = String(body.customerName ?? "").trim().slice(0, 200);
    if (!customerName) {
      return NextResponse.json({ error: "Kundnamn krävs för att markera fakturaunderlaget som klart." }, { status: 400 });
    }
    const discountPercent = num(saved.discountPercent);
    const vatPercent = num(saved.vatPercent, 25);
    const dueDays = Math.round(num(saved.dueDays, 30));
    const { subtotal, discount, net, vat, total } = totalsFor(validLines, discountPercent, vatPercent);
    const payload: InvoiceDraftPayload = {
      versionId: crypto.randomUUID(),
      workOrderId: id,
      status: "ready",
      customerName,
      customerOrgNumber: String(saved.customerOrgNumber ?? "").trim().slice(0, 50),
      customerReference: String(saved.customerReference ?? "").trim().slice(0, 200),
      invoiceDate: String(saved.invoiceDate ?? new Date().toISOString().slice(0, 10)),
      dueDays,
      discountPercent,
      vatPercent,
      note: String(saved.note ?? "").trim().slice(0, 2000),
      lines: validLines,
      subtotal,
      discount,
      net,
      vat,
      total,
      updatedById: user.id,
      updatedAt: new Date().toISOString(),
    };
    const draft = await db.$transaction(async (tx) => {
      const persistedDraft = await createInvoiceDraft(companyId, payload, tx);
      await writeAuditLog(user, {
        entityType: "work_order",
        entityId: id,
        action: "work_order.invoice_basis_ready",
        metadata: { versionId: payload.versionId, subtotal, vat, total, lineCount: validLines.length, storage: "WorkOrderInvoiceDraft" },
      }, tx);
      return persistedDraft;
    });
    return NextResponse.json({ draft }, { status: 201 });
  }

  const status = String(body.status ?? "draft");
  if (status === "exported") {
    return NextResponse.json({
      error: "Statusen exporterad kan inte sättas via fakturaunderlaget. Exportstatus hämtas från exportjobbet.",
    }, { status: 409 });
  }
  if (!clientWritableStatuses.has(status)) return NextResponse.json({ error: "Ogiltig status" }, { status: 400 });
  const customerName = String(body.customerName ?? "").trim().slice(0, 200);
  if (status === "ready" && !customerName) {
    return NextResponse.json({ error: "Kundnamn krävs för att markera fakturaunderlaget som klart." }, { status: 400 });
  }
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
    customerName,
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

    const draft = await db.$transaction(async (tx) => {
      const persistedDraft = await createInvoiceDraft(companyId, payload, tx);
      await writeAuditLog(user, {
        entityType: "work_order",
        entityId: id,
        action: `work_order.invoice_basis_${status}`,
        metadata: { versionId: payload.versionId, subtotal, vat, total, lineCount: validLines.length, storage: "WorkOrderInvoiceDraft" },
      }, tx);
      return persistedDraft;
    });
    return NextResponse.json({ draft }, { status: 201 });
  } catch (error) {
    if (isMissingSchemaColumnError(error) || isMissingTableError(error)) return schemaUnavailable();
    throw error;
  }
}
