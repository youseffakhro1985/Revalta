import { NextResponse } from "next/server";
import db from "@/lib/db";
import { isCronRequestAuthorized } from "@/lib/request-security";
import {
  getInvoiceDraftByVersion,
  getModernInvoiceDraftByVersion,
  getModernInvoiceExportJob,
  listQueuedInvoiceExportJobs,
  upsertInvoiceExportJob,
  type InvoiceExportJobPayload,
} from "@/lib/work-order-ops-storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_JOBS_PER_RUN = 20;
const REQUEST_TIMEOUT_MS = 20_000;

type Obj = Record<string, unknown>;
type Job = InvoiceExportJobPayload & {
  provider: "fortnox" | "visma" | "webhook";
};

type InvoiceLine = {
  id?: string;
  type?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  total?: number;
};

type InvoicePayload = Obj & {
  versionId: string;
  workOrderId: string;
  status: string;
  customerName?: string;
  customerOrgNumber?: string;
  customerReference?: string;
  invoiceDate?: string;
  dueDays?: number;
  discountPercent?: number;
  vatPercent?: number;
  note?: string;
  lines?: InvoiceLine[];
  subtotal?: number;
  discount?: number;
  net?: number;
  vat?: number;
  total?: number;
};

function object(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : null;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asJob(value: InvoiceExportJobPayload): Job | null {
  if (!["fortnox", "visma", "webhook"].includes(value.provider)) return null;
  return {
    ...value,
    provider: value.provider as Job["provider"],
    attempt: Math.max(1, Math.round(number(value.attempt, 1))),
  };
}

function asInvoice(value: unknown): InvoicePayload | null {
  const row = object(value);
  if (!row || !text(row.versionId) || !text(row.workOrderId)) return null;
  return {
    ...row,
    versionId: text(row.versionId),
    workOrderId: text(row.workOrderId),
    status: text(row.status, "draft"),
    lines: Array.isArray(row.lines) ? row.lines as InvoiceLine[] : [],
  };
}

function providerConfig(provider: Job["provider"]) {
  if (provider === "webhook") {
    return {
      endpoint: process.env.INVOICE_WEBHOOK_URL?.trim(),
      token: process.env.INVOICE_WEBHOOK_SECRET?.trim(),
      tokenHeader: "x-revalta-signature",
    };
  }
  if (provider === "fortnox") {
    return {
      endpoint: process.env.FORTNOX_INVOICE_ENDPOINT?.trim(),
      token: process.env.FORTNOX_ACCESS_TOKEN?.trim(),
      tokenHeader: "authorization",
    };
  }
  return {
    endpoint: process.env.VISMA_INVOICE_ENDPOINT?.trim(),
    token: process.env.VISMA_ACCESS_TOKEN?.trim(),
    tokenHeader: "authorization",
  };
}

function exportPayload(args: {
  job: Job;
  invoice: InvoicePayload;
  workOrder: { id: string; title: string; property: { name: string; address: string; postal_code: string | null; city: string }; unit: { designation: string } | null; company: { name: string; org_number: string | null } };
}) {
  const { job, invoice, workOrder } = args;
  return {
    schemaVersion: "1.0",
    idempotencyKey: job.jobId,
    provider: job.provider,
    source: "revalta",
    exportedAt: new Date().toISOString(),
    company: {
      name: workOrder.company.name,
      organizationNumber: workOrder.company.org_number,
    },
    customer: {
      name: invoice.customerName ?? "",
      organizationNumber: invoice.customerOrgNumber ?? "",
      reference: invoice.customerReference ?? "",
    },
    invoice: {
      versionId: invoice.versionId,
      invoiceDate: invoice.invoiceDate,
      dueDays: number(invoice.dueDays, 30),
      currency: "SEK",
      discountPercent: number(invoice.discountPercent),
      vatPercent: number(invoice.vatPercent, 25),
      subtotal: number(invoice.subtotal),
      discount: number(invoice.discount),
      net: number(invoice.net),
      vat: number(invoice.vat),
      total: number(invoice.total),
      note: invoice.note ?? "",
      lines: (invoice.lines ?? []).map((line) => ({
        id: line.id,
        type: line.type,
        description: line.description,
        quantity: number(line.quantity),
        unit: line.unit,
        unitPrice: number(line.unitPrice),
        total: number(line.total),
      })),
    },
    workOrder: {
      id: workOrder.id,
      title: workOrder.title,
      property: workOrder.property,
      unit: workOrder.unit,
    },
  };
}

async function send(job: Job, payload: ReturnType<typeof exportPayload>) {
  const config = providerConfig(job.provider);
  if (!config.endpoint) throw new Error(`${job.provider} saknar konfigurerad fakturaendpoint`);
  if (!config.token) throw new Error(`${job.provider} saknar konfigurerad åtkomstnyckel`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "idempotency-key": job.jobId,
      "x-revalta-job-id": job.jobId,
      "x-revalta-attempt": String(job.attempt),
    };
    headers[config.tokenHeader] = config.tokenHeader === "authorization" ? `Bearer ${config.token}` : config.token;

    const response = await fetch(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`${job.provider} svarade ${response.status}: ${responseText.slice(0, 600) || response.statusText}`);
    }
    return {
      status: response.status,
      externalId: response.headers.get("x-external-id") || response.headers.get("location") || null,
      response: responseText.slice(0, 2000),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error(`${job.provider} svarade inte inom ${REQUEST_TIMEOUT_MS / 1000} sekunder`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function saveJob(companyId: string, job: Job, status: string, extra: Partial<InvoiceExportJobPayload> = {}) {
  return upsertInvoiceExportJob(companyId, {
    ...job,
    ...extra,
    status,
    updatedAt: new Date().toISOString(),
  });
}

export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

  const queuedRaw = await listQueuedInvoiceExportJobs(MAX_JOBS_PER_RUN);
  const queued = queuedRaw
    .map((item) => {
      const job = asJob(item.job);
      return job ? { ...item, job } : null;
    })
    .filter((item): item is { companyId: string; workOrderId: string; job: Job; createdAt: Date } => Boolean(item));

  const result = { queued: queued.length, sent: 0, failed: 0, skipped: 0 };

  for (const item of queued) {
    const { companyId, workOrderId, job } = item;
    if (job.status !== "queued") {
      result.skipped += 1;
      continue;
    }

    // Fail-closed: never rematerialize IE-only jobs into WorkOrderInvoiceExportJob.
    const modernRaw = await getModernInvoiceExportJob(companyId, workOrderId, job.jobId);
    const modernJob = modernRaw ? asJob(modernRaw) : null;
    if (!modernJob) {
      result.skipped += 1;
      continue;
    }

    // Atomic claim: guards against a concurrent/retried cron invocation processing
    // the same job twice (which would submit the same invoice to Fortnox/Visma/the
    // webhook provider more than once). The WHERE clause only matches a row that is
    // still "queued", so at most one concurrent request can flip it to "processing";
    // a losing request sees count 0 and skips instead of re-sending.
    const claim = await db.workOrderInvoiceExportJob.updateMany({
      where: { id: modernJob.jobId, company_id: companyId, status: "queued" },
      data: { status: "processing", processing_started_at: new Date() },
    });
    if (claim.count === 0) {
      result.skipped += 1;
      continue;
    }

    try {
      const workOrder = await db.workOrder.findFirst({
        where: { deleted_at: null, id: workOrderId, company_id: companyId, property: { deleted_at: null } },
        select: {
          id: true,
          title: true,
          property: { select: { name: true, address: true, postal_code: true, city: true } },
          unit: { select: { designation: true } },
          company: { select: { name: true, org_number: true } },
        },
      });

      if (!workOrder) throw new Error("Arbetsordern hittades inte längre");
      if (!modernJob.invoiceVersionId) throw new Error("Exportjobbet saknar fakturaversion");
      const modernInvoice = await getModernInvoiceDraftByVersion(companyId, workOrderId, modernJob.invoiceVersionId);
      if (!modernInvoice) {
        const legacyInvoice = await getInvoiceDraftByVersion(companyId, workOrderId, modernJob.invoiceVersionId);
        throw new Error(
          legacyInvoice
            ? "Faktureringsunderlaget finns kvar i äldre lagring. Kör backfill till WorkOrderInvoiceDraft innan export."
            : "Den kopplade fakturaversionen hittades inte",
        );
      }
      const invoice = asInvoice(modernInvoice);
      if (!invoice) throw new Error("Den kopplade fakturaversionen hittades inte");
      if (!["ready", "exported"].includes(invoice.status)) throw new Error("Faktureringsunderlaget måste vara markerat som redo före export");

      const payload = exportPayload({ job: modernJob, invoice, workOrder });
      const providerResult = await send(modernJob, payload);
      // Receipt fields live on WorkOrderInvoiceExportJob (sent_at/external_id/provider_response).
      await saveJob(companyId, modernJob, "sent", {
        sentAt: new Date().toISOString(),
        providerStatus: providerResult.status,
        externalId: providerResult.externalId,
        providerResponse: providerResult.response,
        error: null,
      });
      result.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Okänt integrationsfel";
      await saveJob(companyId, modernJob, "failed", {
        failedAt: new Date().toISOString(),
        error: message.slice(0, 2000),
      });
      result.failed += 1;
    }
  }

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
