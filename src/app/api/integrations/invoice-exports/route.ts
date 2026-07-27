import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageWorkOrderFinance, canViewFinanceData, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  getModernInvoiceExportJob,
  listInvoiceExportJobs,
  upsertInvoiceExportJob,
  type InvoiceExportJobPayload,
} from "@/lib/work-order-ops-storage";

function configured(provider: string) {
  if (provider === "fortnox") return Boolean(process.env.FORTNOX_ACCESS_TOKEN && process.env.FORTNOX_INVOICE_ENDPOINT);
  if (provider === "visma") return Boolean(process.env.VISMA_ACCESS_TOKEN && process.env.VISMA_INVOICE_ENDPOINT);
  if (provider === "webhook") return Boolean(process.env.INVOICE_WEBHOOK_URL && process.env.INVOICE_WEBHOOK_SECRET);
  return false;
}

async function latestJobs(companyId: string): Promise<InvoiceExportJobPayload[]> {
  const modern = await db.workOrderInvoiceExportJob.findMany({
    where: { company_id: companyId },
    orderBy: { created_at: "asc" },
    take: 10_000,
  });
  if (modern.length) {
    return modern.map((row) => ({
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
      processingStartedAt: row.processing_started_at?.toISOString() ?? null,
      sentAt: row.sent_at?.toISOString() ?? null,
      failedAt: row.failed_at?.toISOString() ?? null,
      providerStatus: row.provider_status,
      externalId: row.external_id,
      providerResponse: row.provider_response,
      source: "table" as const,
    }));
  }

  const workOrders = await db.workOrder.findMany({
    where: { company_id: companyId, deleted_at: null, property: { deleted_at: null } },
    select: { id: true },
    take: 2000,
  });
  const jobs: InvoiceExportJobPayload[] = [];
  for (const workOrder of workOrders) {
    jobs.push(...await listInvoiceExportJobs(companyId, workOrder.id));
  }
  return jobs;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canViewFinanceData(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att visa fakturaexporter" }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status")?.trim();
  const provider = url.searchParams.get("provider")?.trim();
  const query = url.searchParams.get("q")?.trim().toLowerCase();
  const allJobs = await latestJobs(user.company_id);
  const workOrderIds = [...new Set(allJobs.map((job) => job.workOrderId))];
  const orders = await db.workOrder.findMany({
    where: { deleted_at: null, company_id: user.company_id, id: { in: workOrderIds }, property: { deleted_at: null } },
    select: { id: true, title: true, status: true, property: { select: { name: true, address: true, city: true } } },
  });
  const orderMap = new Map(orders.map((order) => [order.id, order]));

  const jobs = allJobs
    .map((job) => ({ ...job, workOrder: orderMap.get(job.workOrderId) ?? null }))
    .filter((job) => !status || String(job.status ?? "") === status)
    .filter((job) => !provider || String(job.provider ?? "") === provider)
    .filter((job) => {
      if (!query) return true;
      const haystack = [job.jobId, job.provider, job.status, job.workOrderId, job.workOrder?.title, job.workOrder?.property?.name, job.error, job.externalId].join(" ").toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => String(b.updatedAt ?? b.createdAt).localeCompare(String(a.updatedAt ?? a.createdAt)))
    .slice(0, 500);

  const counts = allJobs.reduce<Record<string, number>>((acc, job) => {
    const key = String(job.status ?? "unknown");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    jobs,
    counts,
    total: allJobs.length,
    providers: [
      { id: "fortnox", name: "Fortnox", configured: configured("fortnox") },
      { id: "visma", name: "Visma", configured: configured("visma") },
      { id: "webhook", name: "Generell webhook", configured: configured("webhook") },
    ],
    canManage: canManageWorkOrderFinance(user.role),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageWorkOrderFinance(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

  const body = await request.json();
  const action = String(body.action ?? "");
  const jobId = String(body.jobId ?? "");
  if (!jobId || !["retry", "cancel"].includes(action)) return NextResponse.json({ error: "Ogiltig åtgärd" }, { status: 400 });

  const jobs = await latestJobs(user.company_id);
  const existing = jobs.find((job) => job.jobId === jobId);
  if (!existing) return NextResponse.json({ error: "Exportjobbet hittades inte" }, { status: 404 });
  const modern = await getModernInvoiceExportJob(user.company_id, existing.workOrderId, jobId);
  if (!modern) {
    return NextResponse.json({
      error: "Exportjobbet finns kvar i äldre lagring. Kör backfill till WorkOrderInvoiceExportJob innan det kan uppdateras.",
    }, { status: 409 });
  }
  const currentStatus = String(modern.status ?? "");
  if (action === "retry" && currentStatus !== "failed") return NextResponse.json({ error: "Endast misslyckade jobb kan återförsökas" }, { status: 409 });
  if (action === "cancel" && !["queued", "processing"].includes(currentStatus)) return NextResponse.json({ error: "Endast köade eller pågående jobb kan avbrytas" }, { status: 409 });
  const provider = String(modern.provider ?? "");
  if (action === "retry" && !configured(provider)) return NextResponse.json({ error: "Integrationen är inte fullständigt konfigurerad" }, { status: 400 });

  const now = new Date().toISOString();
  const payload: InvoiceExportJobPayload = {
    ...modern,
    status: action === "retry" ? "queued" : "cancelled",
    attempt: Number(modern.attempt ?? 0) + (action === "retry" ? 1 : 0),
    error: null,
    updatedAt: now,
    actedById: user.id,
  };

  const job = await upsertInvoiceExportJob(user.company_id, payload);
  await writeAuditLog(user, {
    entityType: "work_order",
    entityId: modern.workOrderId,
    action: `work_order.invoice_integration_${action}`,
    metadata: { jobId, provider, previousStatus: currentStatus, source: "operations_center", storage: "WorkOrderInvoiceExportJob" },
  });
  return NextResponse.json({ job: { ...job, source: "table" as const } }, { status: 201 });
}
