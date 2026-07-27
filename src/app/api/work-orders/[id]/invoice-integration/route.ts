import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageWorkOrderFinance, canViewFinanceData, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import {
  getLatestInvoiceDraft,
  getModernInvoiceExportJob,
  getModernLatestInvoiceDraft,
  listInvoiceExportJobs,
  upsertInvoiceExportJob,
  type InvoiceExportJobPayload,
} from "@/lib/work-order-ops-storage";

const providers = new Set(["fortnox", "visma", "webhook"]);
const activeStatuses = new Set(["queued", "processing"]);

function configured(provider: string) {
  if (provider === "fortnox") return Boolean(process.env.FORTNOX_ACCESS_TOKEN && process.env.FORTNOX_INVOICE_ENDPOINT);
  if (provider === "visma") return Boolean(process.env.VISMA_ACCESS_TOKEN && process.env.VISMA_INVOICE_ENDPOINT);
  return Boolean(process.env.INVOICE_WEBHOOK_URL && process.env.INVOICE_WEBHOOK_SECRET);
}

async function getOrder(id: string, companyId: string) {
  return db.workOrder.findFirst({ where: { deleted_at: null, id, company_id: companyId, property: { deleted_at: null } }, select: { id: true, title: true } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canViewFinanceData(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att visa fakturaexport" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await getOrder(id, user.company_id))) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const [jobs, invoice] = await Promise.all([
    listInvoiceExportJobs(user.company_id, id),
    getLatestInvoiceDraft(user.company_id, id),
  ]);
  const rows = jobs.sort((a, b) => String(b.updatedAt ?? b.createdAt).localeCompare(String(a.updatedAt ?? a.createdAt)));

  return NextResponse.json({
    providers: [
      { id: "fortnox", name: "Fortnox", configured: configured("fortnox") },
      { id: "visma", name: "Visma", configured: configured("visma") },
      { id: "webhook", name: "Generell webhook", configured: configured("webhook") },
    ],
    jobs: rows,
    hasInvoiceBasis: Boolean(invoice),
    invoiceStatus: typeof invoice?.status === "string" ? invoice.status : null,
    invoiceSource: invoice?.source ?? null,
    canManage: canManageWorkOrderFinance(user.role),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageWorkOrderFinance(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });
  const { id } = await params;
  if (!(await getOrder(id, user.company_id))) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const body = await request.json();
  const action = String(body.action ?? "queue");
  if (!["queue", "retry", "cancel"].includes(action)) return NextResponse.json({ error: "Ogiltig åtgärd" }, { status: 400 });
  const now = new Date().toISOString();
  let payload: InvoiceExportJobPayload;

  if (action === "queue") {
    const provider = String(body.provider ?? "");
    if (!providers.has(provider)) return NextResponse.json({ error: "Ogiltig integrationsleverantör" }, { status: 400 });
    if (!configured(provider)) return NextResponse.json({ error: "Integrationen saknar endpoint eller åtkomstnyckel" }, { status: 400 });

    const modernInvoice = await getModernLatestInvoiceDraft(user.company_id, id);
    const invoice = modernInvoice ?? await getLatestInvoiceDraft(user.company_id, id);
    if (!invoice) return NextResponse.json({ error: "Faktureringsunderlag saknas" }, { status: 400 });
    if (!modernInvoice) {
      return NextResponse.json({
        error: "Faktureringsunderlaget finns kvar i äldre lagring. Kör backfill till WorkOrderInvoiceDraft innan det kan exporteras.",
      }, { status: 409 });
    }
    if (!["ready", "exported"].includes(String(invoice.status ?? ""))) {
      return NextResponse.json({ error: "Faktureringsunderlaget måste markeras som redo före export" }, { status: 400 });
    }
    if (typeof invoice.versionId !== "string") return NextResponse.json({ error: "Faktureringsunderlaget saknar versions-ID" }, { status: 400 });

    const jobs = await listInvoiceExportJobs(user.company_id, id);
    const duplicate = jobs.find((job) =>
      job.provider === provider && job.invoiceVersionId === invoice.versionId && activeStatuses.has(String(job.status ?? "")),
    );
    if (duplicate) return NextResponse.json({ error: "Samma fakturaversion har redan ett aktivt exportjobb för leverantören" }, { status: 409 });

    payload = {
      jobId: crypto.randomUUID(),
      workOrderId: id,
      provider,
      status: "queued",
      attempt: 1,
      invoiceVersionId: invoice.versionId,
      createdById: user.id,
      createdAt: now,
      updatedAt: now,
      error: null,
    };
  } else {
    const jobId = String(body.jobId ?? "");
    const modern = await getModernInvoiceExportJob(user.company_id, id, jobId);
    const jobs = modern ? null : await listInvoiceExportJobs(user.company_id, id);
    const existing = modern ?? jobs?.find((job) => job.jobId === jobId) ?? null;
    if (!existing) return NextResponse.json({ error: "Exportjobbet hittades inte" }, { status: 404 });
    if (!modern) {
      return NextResponse.json({
        error: "Exportjobbet finns kvar i äldre lagring. Kör backfill till WorkOrderInvoiceExportJob innan det kan uppdateras.",
      }, { status: 409 });
    }

    const currentStatus = String(existing.status ?? "");
    const provider = String(existing.provider ?? "");
    if (action === "retry") {
      if (currentStatus !== "failed") return NextResponse.json({ error: "Endast misslyckade jobb kan återförsökas" }, { status: 409 });
      if (!configured(provider)) return NextResponse.json({ error: "Integrationen är inte konfigurerad" }, { status: 400 });
    }
    if (action === "cancel" && !activeStatuses.has(currentStatus)) {
      return NextResponse.json({ error: "Endast köade eller pågående jobb kan avbrytas" }, { status: 409 });
    }

    payload = {
      ...existing,
      status: action === "cancel" ? "cancelled" : "queued",
      attempt: Number(existing.attempt ?? 0) + (action === "retry" ? 1 : 0),
      updatedAt: now,
      error: null,
      actedById: user.id,
    };
  }

  const job = await upsertInvoiceExportJob(user.company_id, payload);
  await writeAuditLog(user, {
    entityType: "work_order",
    entityId: id,
    action: `work_order.invoice_integration_${action}`,
    metadata: {
      jobId: payload.jobId,
      provider: payload.provider,
      status: payload.status,
      attempt: payload.attempt,
      invoiceVersionId: payload.invoiceVersionId,
      storage: "WorkOrderInvoiceExportJob",
    },
  });
  return NextResponse.json({ job: { ...job, source: "table" as const } }, { status: 201 });
}
