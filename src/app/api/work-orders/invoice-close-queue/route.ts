import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageWorkOrderFinance, getCurrentUser } from "@/lib/current-user";
import { invoiceDraftAllowsWorkOrderInvoicing } from "@/lib/invoice-draft-invoicing";
import { normalizeWorkOrderStatus, WORK_ORDER_STATUS_LABELS } from "@/lib/work-order-workflow";

export const dynamic = "force-dynamic";

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageWorkOrderFinance(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att fakturera arbetsordrar" }, { status: 403 });
  }

  const rows = await db.workOrder.findMany({
    where: {
      company_id: user.company_id,
      deleted_at: null,
      status: "completed",
      property: { deleted_at: null },
      invoice_drafts: { some: { status: { in: ["ready", "exported"] } } },
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
        select: { status: true, customer_name: true, total: true },
      },
    },
  });

  const workOrders = rows.flatMap((row) => {
    const latest = row.invoice_drafts[0];
    if (!invoiceDraftAllowsWorkOrderInvoicing(latest)) return [];
    const status = normalizeWorkOrderStatus(row.status);
    const draftStatus = latest.status === "exported" ? "exported" : "ready";
    return [{
      id: row.id,
      title: row.title,
      status,
      statusLabel: WORK_ORDER_STATUS_LABELS[status],
      propertyName: row.property.name,
      customerName: latest.customer_name.trim(),
      total: num(latest.total),
      draftStatus,
      draftStatusLabel: draftStatus === "exported" ? "Exporterat" : "Klart",
      updatedAt: row.updated_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null,
      href: `/dashboard/arbetsorder/${row.id}#ekonomi`,
    }];
  }).slice(0, 50);

  return NextResponse.json(
    {
      summary: { workOrders: workOrders.length },
      workOrders,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
