import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

const JOB_TYPE = "work_order.invoice_integration_job";
const INVOICE_TYPE = "work_order.invoice_basis";
const providers = new Set(["fortnox", "visma", "webhook"]);
const activeStatuses = new Set(["queued", "processing"]);
type Obj = Record<string, unknown>;

function asObject(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : null;
}

function configured(provider: string) {
  if (provider === "fortnox") return Boolean(process.env.FORTNOX_ACCESS_TOKEN && process.env.FORTNOX_INVOICE_ENDPOINT);
  if (provider === "visma") return Boolean(process.env.VISMA_ACCESS_TOKEN && process.env.VISMA_INVOICE_ENDPOINT);
  return Boolean(process.env.INVOICE_WEBHOOK_URL && process.env.INVOICE_WEBHOOK_SECRET);
}

async function getOrder(id: string, companyId: string) {
  return db.workOrder.findFirst({ where: { id, company_id: companyId }, select: { id: true, title: true } });
}

async function latestInvoice(id: string, companyId: string) {
  const event = await db.integrationEvent.findFirst({
    where: { company_id: companyId, recipient: id, type: INVOICE_TYPE },
    orderBy: { created_at: "desc" },
  });
  return event ? asObject(event.payload) : null;
}

async function jobsFor(id: string, companyId: string) {
  const events = await db.integrationEvent.findMany({
    where: { company_id: companyId, recipient: id, type: JOB_TYPE },
    orderBy: { created_at: "asc" },
    take: 3000,
  });
  const jobs = new Map<string, Obj & { createdAt: string }>();
  for (const event of events) {
    const payload = asObject(event.payload);
    if (!payload || typeof payload.jobId !== "string") continue;
    const previous = jobs.get(payload.jobId);
    jobs.set(payload.jobId, {
      ...previous,
      ...payload,
      createdAt: previous?.createdAt ?? event.created_at.toISOString(),
    });
  }
  return jobs;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  const { id } = await params;
  if (!(await getOrder(id, user.company_id))) return NextResponse.json({ error: "Arbetsordern hittades inte" }, { status: 404 });

  const jobs = await jobsFor(id, user.company_id);
  const rows = [...jobs.values()].sort((a, b) => String(b.updatedAt ?? b.createdAt).localeCompare(String(a.updatedAt ?? a.createdAt)));
  const invoice = await latestInvoice(id, user.company_id);

  return NextResponse.json({
    providers: [
      { id: "fortnox", name: "Fortnox", configured: configured("fortnox") },
      { id: "visma", name: "Visma", configured: configured("visma") },
      { id: "webhook", name: "Generell webhook", configured: configured("webhook") },
    ],
    jobs: rows,
    hasInvoiceBasis: Boolean(invoice),
    invoiceStatus: typeof invoice?.status === "string" ? invoice.status : null,
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
  const action = String(body.action ?? "queue");
  if (!["queue", "retry", "cancel"].includes(action)) return NextResponse.json({ error: "Ogiltig åtgärd" }, { status: 400 });
  const now = new Date().toISOString();
  let payload: Obj;

  if (action === "queue") {
    const provider = String(body.provider ?? "");
    if (!providers.has(provider)) return NextResponse.json({ error: "Ogiltig integrationsleverantör" }, { status: 400 });
    if (!configured(provider)) return NextResponse.json({ error: "Integrationen saknar endpoint eller åtkomstnyckel" }, { status: 400 });

    const invoice = await latestInvoice(id, user.company_id);
    if (!invoice) return NextResponse.json({ error: "Faktureringsunderlag saknas" }, { status: 400 });
    if (!["ready", "exported"].includes(String(invoice.status ?? ""))) {
      return NextResponse.json({ error: "Faktureringsunderlaget måste markeras som redo före export" }, { status: 400 });
    }
    if (typeof invoice.versionId !== "string") return NextResponse.json({ error: "Faktureringsunderlaget saknar versions-ID" }, { status: 400 });

    const jobs = await jobsFor(id, user.company_id);
    const duplicate = [...jobs.values()].find((job) =>
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
    const jobs = await jobsFor(id, user.company_id);
    const existing = jobs.get(jobId);
    if (!existing) return NextResponse.json({ error: "Exportjobbet hittades inte" }, { status: 404 });

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

  const jsonPayload = JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
  await db.integrationEvent.create({
    data: {
      company_id: user.company_id,
      type: JOB_TYPE,
      status: String(payload.status),
      recipient: id,
      payload: jsonPayload,
    },
  });
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
    },
  });
  return NextResponse.json({ job: payload }, { status: 201 });
}
