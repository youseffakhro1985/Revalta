import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { canManageTickets, getCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";

const JOB_TYPE = "work_order.invoice_integration_job";
type Obj = Record<string, unknown>;

function object(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : null;
}

function configured(provider: string) {
  if (provider === "fortnox") return Boolean(process.env.FORTNOX_ACCESS_TOKEN && process.env.FORTNOX_INVOICE_ENDPOINT);
  if (provider === "visma") return Boolean(process.env.VISMA_ACCESS_TOKEN && process.env.VISMA_INVOICE_ENDPOINT);
  if (provider === "webhook") return Boolean(process.env.INVOICE_WEBHOOK_URL && process.env.INVOICE_WEBHOOK_SECRET);
  return false;
}

async function latestJobs(companyId: string) {
  const events = await db.integrationEvent.findMany({
    where: { company_id: companyId, type: JOB_TYPE },
    orderBy: { created_at: "asc" },
    take: 10000,
    select: { recipient: true, payload: true, created_at: true },
  });
  const jobs = new Map<string, Obj & { createdAt: string; workOrderId: string }>();
  for (const event of events) {
    const payload = object(event.payload);
    if (!payload || typeof payload.jobId !== "string" || !event.recipient) continue;
    const previous = jobs.get(payload.jobId);
    jobs.set(payload.jobId, {
      ...previous,
      ...payload,
      workOrderId: event.recipient,
      createdAt: previous?.createdAt ?? event.created_at.toISOString(),
    });
  }
  return [...jobs.values()];
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status")?.trim();
  const provider = url.searchParams.get("provider")?.trim();
  const query = url.searchParams.get("q")?.trim().toLowerCase();
  const allJobs = await latestJobs(user.company_id);
  const workOrderIds = [...new Set(allJobs.map(job => job.workOrderId))];
  const orders = await db.workOrder.findMany({
    where: { company_id: user.company_id, id: { in: workOrderIds } },
    select: { id: true, title: true, status: true, property: { select: { name: true, address: true, city: true } } },
  });
  const orderMap = new Map(orders.map(order => [order.id, order]));

  const jobs = allJobs
    .map(job => ({ ...job, workOrder: orderMap.get(job.workOrderId) ?? null }))
    .filter(job => !status || job.status === status)
    .filter(job => !provider || job.provider === provider)
    .filter(job => {
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
    canManage: canManageTickets(user.role),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageTickets(user.role)) return NextResponse.json({ error: "Du saknar behörighet" }, { status: 403 });

  const body = await request.json();
  const action = String(body.action ?? "");
  const jobId = String(body.jobId ?? "");
  if (!jobId || !["retry", "cancel"].includes(action)) return NextResponse.json({ error: "Ogiltig åtgärd" }, { status: 400 });

  const jobs = await latestJobs(user.company_id);
  const existing = jobs.find(job => job.jobId === jobId);
  if (!existing) return NextResponse.json({ error: "Exportjobbet hittades inte" }, { status: 404 });
  const currentStatus = String(existing.status ?? "");
  if (action === "retry" && currentStatus !== "failed") return NextResponse.json({ error: "Endast misslyckade jobb kan köras om" }, { status: 409 });
  if (action === "cancel" && !["queued", "processing"].includes(currentStatus)) return NextResponse.json({ error: "Jobbet kan inte avbrytas i nuvarande status" }, { status: 409 });
  const provider = String(existing.provider ?? "");
  if (action === "retry" && !configured(provider)) return NextResponse.json({ error: "Integrationen är inte fullständigt konfigurerad" }, { status: 400 });

  const now = new Date().toISOString();
  const payload: Obj = {
    ...existing,
    status: action === "retry" ? "queued" : "cancelled",
    attempt: Number(existing.attempt ?? 0) + (action === "retry" ? 1 : 0),
    error: null,
    updatedAt: now,
    actedById: user.id,
    actionSource: "operations_center",
  };
  delete payload.workOrder;

  await db.integrationEvent.create({
    data: {
      company_id: user.company_id,
      type: JOB_TYPE,
      status: String(payload.status),
      recipient: existing.workOrderId,
      payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
    },
  });
  await writeAuditLog(user, {
    entityType: "work_order",
    entityId: existing.workOrderId,
    action: `work_order.invoice_integration_${action}`,
    metadata: { jobId, provider, previousStatus: currentStatus, source: "operations_center" },
  });
  return NextResponse.json({ job: payload }, { status: 201 });
}
