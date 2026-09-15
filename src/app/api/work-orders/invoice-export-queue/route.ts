import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageWorkOrderFinance, getCurrentUser } from "@/lib/current-user";
import { normalizeWorkOrderStatus, WORK_ORDER_STATUS_LABELS } from "@/lib/work-order-workflow";

export const dynamic = "force-dynamic";

const blockingExportStatuses = new Set(["queued", "processing", "sent", "failed"]);

function configured(provider: string) {
  if (provider === "fortnox") return Boolean(process.env.FORTNOX_ACCESS_TOKEN && process.env.FORTNOX_INVOICE_ENDPOINT);
  if (provider === "visma") return Boolean(process.env.VISMA_ACCESS_TOKEN && process.env.VISMA_INVOICE_ENDPOINT);
  return Boolean(process.env.INVOICE_WEBHOOK_URL && process.env.INVOICE_WEBHOOK_SECRET);
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageWorkOrderFinance(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att köa fakturaexport" }, { status: 403 });
  }

  const rows = await db.workOrder.findMany({
    where: {
      company_id: user.company_id,
      deleted_at: null,
      status: { notIn: ["invoiced", "cancelled"] },
      property: { deleted_at: null },
      invoice_drafts: { some: { status: "ready" } },
    },
    orderBy: { updated_at: "desc" },
    take: 80,
    select: {
      id: true,
      title: true,
      status: true,
      updated_at: true,
      completed_at: true,
      property: { select: { id: true, name: true } },
      invoice_drafts: {
        orderBy: { created_at: "desc" },
        take: 1,
        select: { status: true, customer_name: true, total: true, version_id: true },
      },
      invoice_export_jobs: {
        select: { status: true, invoice_version_id: true },
      },
    },
  });

  const workOrders = rows.flatMap((row) => {
    const latest = row.invoice_drafts[0];
    if (!latest || latest.status !== "ready") return [];
    const alreadyQueued = row.invoice_export_jobs.some(
      (job) => job.invoice_version_id === latest.version_id && blockingExportStatuses.has(job.status),
    );
    if (alreadyQueued) return [];
    const status = normalizeWorkOrderStatus(row.status);
    return [{
      id: row.id,
      title: row.title,
      status,
      statusLabel: WORK_ORDER_STATUS_LABELS[status],
      propertyName: row.property.name,
      customerName: latest.customer_name.trim(),
      total: num(latest.total),
      updatedAt: row.updated_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null,
      href: `/dashboard/arbetsorder/${row.id}#ekonomi`,
    }];
  }).slice(0, 50);

  const providers = [
    { id: "fortnox", name: "Fortnox (HTTP-endpoint)", configured: configured("fortnox") },
    { id: "visma", name: "Visma (HTTP-endpoint)", configured: configured("visma") },
    { id: "webhook", name: "Generell webhook", configured: configured("webhook") },
  ];

  return NextResponse.json(
    {
      summary: { workOrders: workOrders.length },
      providers,
      workOrders,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
