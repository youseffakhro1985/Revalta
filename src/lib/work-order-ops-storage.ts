import type { Prisma } from "@prisma/client";
import db from "@/lib/db";

type DbClient = Pick<
  typeof db,
  | "workOrderTimeEntry"
  | "workOrderMaterialEntry"
  | "workOrderProfitabilitySettings"
  | "workOrderInvoiceDraft"
  | "workOrderInvoiceExportJob"
  | "integrationEvent"
>;

export type TimeEntryPayload = {
  entryId: string;
  workOrderId: string;
  userId: string;
  userName?: string | null;
  userEmail: string;
  kind: "work" | "travel" | "break";
  action: "manual" | "start" | "stop" | "approve" | "reject";
  startedAt?: string | null;
  endedAt?: string | null;
  minutes?: number | null;
  billable?: boolean;
  note?: string | null;
  status?: "running" | "submitted" | "approved" | "rejected";
  actorId: string;
  createdAt?: string;
};

export type MaterialEntryPayload = {
  entryId: string;
  workOrderId: string;
  articleNumber?: string | null;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  supplier?: string | null;
  stockStatus: "in_stock" | "ordered" | "used" | "returned";
  billable: boolean;
  note?: string | null;
  status: "submitted" | "approved" | "rejected" | "deleted";
  createdById: string;
  createdByName?: string | null;
  createdByEmail: string;
  actorId: string;
  createdAt?: string;
};

export type ProfitabilitySettingsPayload = {
  internalHourlyCost: number;
  customerHourlyRate: number;
  materialMarkupPercent: number;
  otherCost: number;
  fixedRevenue: number;
  updatedById?: string;
  updatedAt?: string;
};

export type InvoiceDraftPayload = {
  versionId: string;
  workOrderId: string;
  status: string;
  customerName: string;
  customerOrgNumber: string;
  customerReference: string;
  invoiceDate: string;
  dueDays: number;
  discountPercent: number;
  vatPercent: number;
  note: string;
  lines: unknown[];
  subtotal: number;
  discount: number;
  net: number;
  vat: number;
  total: number;
  updatedById: string;
  updatedAt: string;
};

export type InvoiceExportJobPayload = {
  jobId: string;
  workOrderId: string;
  provider: string;
  status: string;
  attempt: number;
  invoiceVersionId: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  error?: string | null;
  actedById?: string | null;
  processingStartedAt?: string | null;
  sentAt?: string | null;
  failedAt?: string | null;
  providerStatus?: number | null;
  externalId?: string | null;
  providerResponse?: string | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateOrNull(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function mapTimeRow(row: {
  id: string;
  work_order_id: string;
  user_id: string;
  user_name: string | null;
  user_email: string;
  kind: string;
  action: string;
  started_at: Date | null;
  ended_at: Date | null;
  minutes: number | null;
  billable: boolean;
  note: string | null;
  status: string;
  actor_id: string;
  created_at: Date;
}): TimeEntryPayload {
  return {
    entryId: row.id,
    workOrderId: row.work_order_id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    kind: row.kind as TimeEntryPayload["kind"],
    action: row.action as TimeEntryPayload["action"],
    startedAt: iso(row.started_at),
    endedAt: iso(row.ended_at),
    minutes: row.minutes,
    billable: row.billable,
    note: row.note,
    status: row.status as TimeEntryPayload["status"],
    actorId: row.actor_id,
    createdAt: row.created_at.toISOString(),
  };
}

function mapMaterialRow(row: {
  id: string;
  work_order_id: string;
  article_number: string | null;
  name: string;
  quantity: { toString(): string } | number;
  unit: string;
  unit_price: { toString(): string } | number;
  total: { toString(): string } | number;
  supplier: string | null;
  stock_status: string;
  billable: boolean;
  note: string | null;
  status: string;
  created_by_id: string;
  created_by_name: string | null;
  created_by_email: string;
  actor_id: string;
  created_at: Date;
}): MaterialEntryPayload {
  return {
    entryId: row.id,
    workOrderId: row.work_order_id,
    articleNumber: row.article_number,
    name: row.name,
    quantity: num(row.quantity),
    unit: row.unit,
    unitPrice: num(row.unit_price),
    total: num(row.total),
    supplier: row.supplier,
    stockStatus: row.stock_status as MaterialEntryPayload["stockStatus"],
    billable: row.billable,
    note: row.note,
    status: row.status as MaterialEntryPayload["status"],
    createdById: row.created_by_id,
    createdByName: row.created_by_name,
    createdByEmail: row.created_by_email,
    actorId: row.actor_id,
    createdAt: row.created_at.toISOString(),
  };
}

function mapProfitRow(row: {
  internal_hourly_cost: { toString(): string } | number;
  customer_hourly_rate: { toString(): string } | number;
  material_markup_percent: { toString(): string } | number;
  other_cost: { toString(): string } | number;
  fixed_revenue: { toString(): string } | number;
  updated_by_id: string;
  updated_at: Date;
}): ProfitabilitySettingsPayload {
  return {
    internalHourlyCost: num(row.internal_hourly_cost, 350),
    customerHourlyRate: num(row.customer_hourly_rate, 650),
    materialMarkupPercent: num(row.material_markup_percent, 15),
    otherCost: num(row.other_cost),
    fixedRevenue: num(row.fixed_revenue),
    updatedById: row.updated_by_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapDraftRow(row: {
  version_id: string;
  work_order_id: string;
  status: string;
  customer_name: string;
  customer_org_number: string;
  customer_reference: string;
  invoice_date: string;
  due_days: number;
  discount_percent: { toString(): string } | number;
  vat_percent: { toString(): string } | number;
  note: string;
  lines: unknown;
  subtotal: { toString(): string } | number;
  discount: { toString(): string } | number;
  net: { toString(): string } | number;
  vat: { toString(): string } | number;
  total: { toString(): string } | number;
  updated_by_id: string;
  updated_at: Date;
}): InvoiceDraftPayload {
  return {
    versionId: row.version_id,
    workOrderId: row.work_order_id,
    status: row.status,
    customerName: row.customer_name,
    customerOrgNumber: row.customer_org_number,
    customerReference: row.customer_reference,
    invoiceDate: row.invoice_date,
    dueDays: row.due_days,
    discountPercent: num(row.discount_percent),
    vatPercent: num(row.vat_percent, 25),
    note: row.note,
    lines: Array.isArray(row.lines) ? row.lines : [],
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    net: num(row.net),
    vat: num(row.vat),
    total: num(row.total),
    updatedById: row.updated_by_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapJobRow(row: {
  id: string;
  work_order_id: string;
  provider: string;
  status: string;
  attempt: number;
  invoice_version_id: string;
  error: string | null;
  provider_status: number | null;
  external_id: string | null;
  provider_response: string | null;
  processing_started_at: Date | null;
  sent_at: Date | null;
  failed_at: Date | null;
  created_by_id: string;
  acted_by_id: string | null;
  created_at: Date;
  updated_at: Date;
}): InvoiceExportJobPayload {
  return {
    jobId: row.id,
    workOrderId: row.work_order_id,
    provider: row.provider,
    status: row.status,
    attempt: row.attempt,
    invoiceVersionId: row.invoice_version_id,
    createdById: row.created_by_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    error: row.error,
    actedById: row.acted_by_id,
    processingStartedAt: iso(row.processing_started_at),
    sentAt: iso(row.sent_at),
    failedAt: iso(row.failed_at),
    providerStatus: row.provider_status,
    externalId: row.external_id,
    providerResponse: row.provider_response,
  };
}

export async function listTimeEntries(companyId: string, workOrderId: string, client: DbClient = db) {
  const [modern, events] = await Promise.all([
    client.workOrderTimeEntry.findMany({
      where: { company_id: companyId, work_order_id: workOrderId },
      orderBy: { created_at: "asc" },
      take: 2000,
    }),
    client.integrationEvent.findMany({
      where: { company_id: companyId, type: "work_order.time_entry", recipient: workOrderId },
      orderBy: { created_at: "asc" },
      take: 2000,
    }),
  ]);
  const entries = new Map<string, TimeEntryPayload>();
  for (const event of events) {
    const payload = asObject(event.payload);
    if (!payload || typeof payload.entryId !== "string" || payload.workOrderId !== workOrderId) continue;
    const previous = entries.get(payload.entryId);
    entries.set(payload.entryId, {
      ...(previous ?? {}),
      ...(payload as unknown as TimeEntryPayload),
      createdAt: previous?.createdAt ?? event.created_at.toISOString(),
    });
  }
  for (const row of modern) entries.set(row.id, mapTimeRow(row));
  return [...entries.values()];
}

export async function getModernTimeEntry(companyId: string, workOrderId: string, entryId: string, client: DbClient = db) {
  const modern = await client.workOrderTimeEntry.findFirst({
    where: { id: entryId, company_id: companyId, work_order_id: workOrderId },
  });
  return modern ? mapTimeRow(modern) : null;
}

export async function getTimeEntry(companyId: string, workOrderId: string, entryId: string, client: DbClient = db) {
  const modern = await getModernTimeEntry(companyId, workOrderId, entryId, client);
  if (modern) return modern;
  const entries = await listTimeEntries(companyId, workOrderId, client);
  return entries.find((entry) => entry.entryId === entryId) ?? null;
}

export async function upsertTimeEntry(companyId: string, payload: TimeEntryPayload, client: DbClient = db) {
  const data = {
    company_id: companyId,
    work_order_id: payload.workOrderId,
    user_id: payload.userId,
    user_name: payload.userName ?? null,
    user_email: payload.userEmail,
    kind: payload.kind,
    action: payload.action,
    started_at: dateOrNull(payload.startedAt),
    ended_at: dateOrNull(payload.endedAt),
    minutes: payload.minutes ?? null,
    billable: payload.billable !== false,
    note: payload.note ?? null,
    status: payload.status ?? "submitted",
    actor_id: payload.actorId,
  };
  return client.workOrderTimeEntry.upsert({
    where: { id: payload.entryId },
    create: { id: payload.entryId, ...data },
    update: data,
  }).then(mapTimeRow);
}

export async function listMaterialEntries(companyId: string, workOrderId: string, client: DbClient = db) {
  const [modern, events] = await Promise.all([
    client.workOrderMaterialEntry.findMany({
      where: { company_id: companyId, work_order_id: workOrderId },
      orderBy: { created_at: "asc" },
      take: 3000,
    }),
    client.integrationEvent.findMany({
      where: { company_id: companyId, type: "work_order.material_entry", recipient: workOrderId },
      orderBy: { created_at: "asc" },
      take: 3000,
    }),
  ]);
  const latest = new Map<string, MaterialEntryPayload>();
  for (const event of events) {
    const payload = asObject(event.payload);
    if (!payload || typeof payload.entryId !== "string" || payload.workOrderId !== workOrderId) continue;
    const previous = latest.get(payload.entryId);
    latest.set(payload.entryId, {
      ...(previous ?? {}),
      ...(payload as unknown as MaterialEntryPayload),
      createdAt: previous?.createdAt ?? event.created_at.toISOString(),
    });
  }
  for (const row of modern) latest.set(row.id, mapMaterialRow(row));
  return [...latest.values()];
}

export async function getModernMaterialEntry(companyId: string, workOrderId: string, entryId: string, client: DbClient = db) {
  const modern = await client.workOrderMaterialEntry.findFirst({
    where: { id: entryId, company_id: companyId, work_order_id: workOrderId },
  });
  return modern ? mapMaterialRow(modern) : null;
}

export async function getMaterialEntry(companyId: string, workOrderId: string, entryId: string, client: DbClient = db) {
  const modern = await getModernMaterialEntry(companyId, workOrderId, entryId, client);
  if (modern) return modern;
  const entries = await listMaterialEntries(companyId, workOrderId, client);
  return entries.find((entry) => entry.entryId === entryId) ?? null;
}

export async function upsertMaterialEntry(companyId: string, payload: MaterialEntryPayload, client: DbClient = db) {
  const data = {
    company_id: companyId,
    work_order_id: payload.workOrderId,
    article_number: payload.articleNumber ?? null,
    name: payload.name,
    quantity: payload.quantity,
    unit: payload.unit,
    unit_price: payload.unitPrice,
    total: payload.total,
    supplier: payload.supplier ?? null,
    stock_status: payload.stockStatus,
    billable: payload.billable,
    note: payload.note ?? null,
    status: payload.status,
    created_by_id: payload.createdById,
    created_by_name: payload.createdByName ?? null,
    created_by_email: payload.createdByEmail,
    actor_id: payload.actorId,
  };
  return client.workOrderMaterialEntry.upsert({
    where: { id: payload.entryId },
    create: { id: payload.entryId, ...data },
    update: {
      article_number: data.article_number,
      name: data.name,
      quantity: data.quantity,
      unit: data.unit,
      unit_price: data.unit_price,
      total: data.total,
      supplier: data.supplier,
      stock_status: data.stock_status,
      billable: data.billable,
      note: data.note,
      status: data.status,
      actor_id: data.actor_id,
    },
  }).then(mapMaterialRow);
}

export async function getProfitabilitySettings(companyId: string, workOrderId: string, client: DbClient = db) {
  const modern = await client.workOrderProfitabilitySettings.findUnique({ where: { work_order_id: workOrderId } });
  if (modern && modern.company_id === companyId) return mapProfitRow(modern);

  const event = await client.integrationEvent.findFirst({
    where: { company_id: companyId, type: "work_order.profitability_settings", recipient: workOrderId },
    orderBy: { created_at: "desc" },
  });
  const payload = asObject(event?.payload);
  if (!payload) {
    return {
      internalHourlyCost: 350,
      customerHourlyRate: 650,
      materialMarkupPercent: 15,
      otherCost: 0,
      fixedRevenue: 0,
    } satisfies ProfitabilitySettingsPayload;
  }
  return {
    internalHourlyCost: num(payload.internalHourlyCost, 350),
    customerHourlyRate: num(payload.customerHourlyRate, 650),
    materialMarkupPercent: num(payload.materialMarkupPercent, 15),
    otherCost: num(payload.otherCost),
    fixedRevenue: num(payload.fixedRevenue),
    updatedById: typeof payload.updatedById === "string" ? payload.updatedById : undefined,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : event?.created_at.toISOString(),
  };
}

export async function upsertProfitabilitySettings(
  companyId: string,
  workOrderId: string,
  userId: string,
  settings: ProfitabilitySettingsPayload,
  client: DbClient = db,
) {
  const row = await client.workOrderProfitabilitySettings.upsert({
    where: { work_order_id: workOrderId },
    create: {
      company_id: companyId,
      work_order_id: workOrderId,
      internal_hourly_cost: settings.internalHourlyCost,
      customer_hourly_rate: settings.customerHourlyRate,
      material_markup_percent: settings.materialMarkupPercent,
      other_cost: settings.otherCost,
      fixed_revenue: settings.fixedRevenue,
      updated_by_id: userId,
    },
    update: {
      internal_hourly_cost: settings.internalHourlyCost,
      customer_hourly_rate: settings.customerHourlyRate,
      material_markup_percent: settings.materialMarkupPercent,
      other_cost: settings.otherCost,
      fixed_revenue: settings.fixedRevenue,
      updated_by_id: userId,
    },
  });
  return mapProfitRow(row);
}

export async function getLatestInvoiceDraft(companyId: string, workOrderId: string, client: DbClient = db) {
  const modern = await client.workOrderInvoiceDraft.findFirst({
    where: { company_id: companyId, work_order_id: workOrderId },
    orderBy: { created_at: "desc" },
  });
  if (modern) return mapDraftRow(modern);

  const event = await client.integrationEvent.findFirst({
    where: { company_id: companyId, type: "work_order.invoice_basis", recipient: workOrderId },
    orderBy: { created_at: "desc" },
  });
  const payload = asObject(event?.payload);
  return payload ? payload as unknown as InvoiceDraftPayload : null;
}

export async function getInvoiceDraftByVersion(
  companyId: string,
  workOrderId: string,
  versionId: string,
  client: DbClient = db,
) {
  const modern = await client.workOrderInvoiceDraft.findFirst({
    where: { company_id: companyId, work_order_id: workOrderId, version_id: versionId },
  });
  if (modern) return mapDraftRow(modern);

  const events = await client.integrationEvent.findMany({
    where: { company_id: companyId, type: "work_order.invoice_basis", recipient: workOrderId },
    orderBy: { created_at: "desc" },
    take: 100,
  });
  for (const event of events) {
    const payload = asObject(event.payload);
    if (payload && payload.versionId === versionId) return payload as unknown as InvoiceDraftPayload;
  }
  return null;
}

export async function createInvoiceDraft(companyId: string, payload: InvoiceDraftPayload, client: DbClient = db) {
  const row = await client.workOrderInvoiceDraft.create({
    data: {
      company_id: companyId,
      work_order_id: payload.workOrderId,
      version_id: payload.versionId,
      status: payload.status,
      customer_name: payload.customerName,
      customer_org_number: payload.customerOrgNumber,
      customer_reference: payload.customerReference,
      invoice_date: payload.invoiceDate,
      due_days: payload.dueDays,
      discount_percent: payload.discountPercent,
      vat_percent: payload.vatPercent,
      note: payload.note,
      lines: payload.lines as Prisma.InputJsonValue,
      subtotal: payload.subtotal,
      discount: payload.discount,
      net: payload.net,
      vat: payload.vat,
      total: payload.total,
      updated_by_id: payload.updatedById,
    },
  });
  return mapDraftRow(row);
}

export async function listInvoiceExportJobs(companyId: string, workOrderId: string, client: DbClient = db) {
  const [modern, events] = await Promise.all([
    client.workOrderInvoiceExportJob.findMany({
      where: { company_id: companyId, work_order_id: workOrderId },
      orderBy: { created_at: "asc" },
      take: 3000,
    }),
    client.integrationEvent.findMany({
      where: { company_id: companyId, type: "work_order.invoice_integration_job", recipient: workOrderId },
      orderBy: { created_at: "asc" },
      take: 3000,
    }),
  ]);
  const jobs = new Map<string, InvoiceExportJobPayload>();
  for (const event of events) {
    const payload = asObject(event.payload);
    if (!payload || typeof payload.jobId !== "string") continue;
    const previous = jobs.get(payload.jobId);
    jobs.set(payload.jobId, {
      ...(previous ?? {}),
      ...(payload as unknown as InvoiceExportJobPayload),
      createdAt: previous?.createdAt ?? event.created_at.toISOString(),
    });
  }
  for (const row of modern) jobs.set(row.id, mapJobRow(row));
  return [...jobs.values()];
}

export async function upsertInvoiceExportJob(companyId: string, payload: InvoiceExportJobPayload, client: DbClient = db) {
  const data = {
    company_id: companyId,
    work_order_id: payload.workOrderId,
    provider: payload.provider,
    status: payload.status,
    attempt: payload.attempt,
    invoice_version_id: payload.invoiceVersionId,
    error: payload.error ?? null,
    provider_status: payload.providerStatus ?? null,
    external_id: payload.externalId ?? null,
    provider_response: payload.providerResponse ?? null,
    processing_started_at: dateOrNull(payload.processingStartedAt),
    sent_at: dateOrNull(payload.sentAt),
    failed_at: dateOrNull(payload.failedAt),
    created_by_id: payload.createdById,
    acted_by_id: payload.actedById ?? null,
  };
  const row = await client.workOrderInvoiceExportJob.upsert({
    where: { id: payload.jobId },
    create: {
      id: payload.jobId,
      ...data,
      created_at: dateOrNull(payload.createdAt) ?? new Date(),
    },
    update: {
      provider: data.provider,
      status: data.status,
      attempt: data.attempt,
      invoice_version_id: data.invoice_version_id,
      error: data.error,
      provider_status: data.provider_status,
      external_id: data.external_id,
      provider_response: data.provider_response,
      processing_started_at: data.processing_started_at,
      sent_at: data.sent_at,
      failed_at: data.failed_at,
      acted_by_id: data.acted_by_id,
    },
  });
  return mapJobRow(row);
}

export async function listQueuedInvoiceExportJobs(take = 25, client: DbClient = db) {
  const [modern, events] = await Promise.all([
    client.workOrderInvoiceExportJob.findMany({
      where: { status: "queued" },
      orderBy: { created_at: "asc" },
      take: 10_000,
    }),
    client.integrationEvent.findMany({
      where: { type: "work_order.invoice_integration_job" },
      orderBy: { created_at: "asc" },
      take: 10_000,
      select: { company_id: true, recipient: true, payload: true, created_at: true },
    }),
  ]);
  const latest = new Map<string, { companyId: string; workOrderId: string; job: InvoiceExportJobPayload; createdAt: Date }>();
  for (const event of events) {
    const payload = asObject(event.payload);
    if (!payload || typeof payload.jobId !== "string" || !event.company_id || !event.recipient) continue;
    const previous = latest.get(`${event.company_id}:${payload.jobId}`);
    latest.set(`${event.company_id}:${payload.jobId}`, {
      companyId: event.company_id,
      workOrderId: event.recipient,
      job: {
        ...(previous?.job ?? {}),
        ...(payload as unknown as InvoiceExportJobPayload),
        createdAt: previous?.job.createdAt ?? event.created_at.toISOString(),
      },
      createdAt: previous?.createdAt ?? event.created_at,
    });
  }
  for (const row of modern) {
    latest.set(`${row.company_id}:${row.id}`, {
      companyId: row.company_id,
      workOrderId: row.work_order_id,
      job: mapJobRow(row),
      createdAt: row.created_at,
    });
  }
  return [...latest.values()]
    .filter((item) => item.job.status === "queued")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, take);
}
