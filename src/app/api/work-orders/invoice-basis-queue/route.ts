import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageWorkOrderFinance, getCurrentUser } from "@/lib/current-user";
import { normalizeWorkOrderStatus, WORK_ORDER_STATUS_LABELS } from "@/lib/work-order-workflow";

export const dynamic = "force-dynamic";

const lockedDraftStatuses = new Set(["ready", "exported"]);

function draftLineCount(lines: unknown) {
  return Array.isArray(lines) ? lines.length : 0;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canManageWorkOrderFinance(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att bygga fakturaunderlag" }, { status: 403 });
  }

  const rows = await db.workOrder.findMany({
    where: {
      company_id: user.company_id,
      deleted_at: null,
      status: { notIn: ["invoiced", "cancelled"] },
      property: { deleted_at: null },
      OR: [
        { time_entries: { some: { status: "approved", billable: true, kind: { not: "break" } } } },
        { material_entries: { some: { status: "approved", billable: true } } },
      ],
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
      time_entries: {
        where: { status: "approved", billable: true, kind: { not: "break" } },
        select: { id: true },
      },
      material_entries: {
        where: { status: "approved", billable: true },
        select: { id: true },
      },
      invoice_drafts: {
        orderBy: { created_at: "desc" },
        take: 1,
        select: { status: true, lines: true },
      },
    },
  });

  const workOrders = rows.flatMap((row) => {
    const latest = row.invoice_drafts[0];
    if (latest && lockedDraftStatuses.has(latest.status)) return [];
    if (latest && draftLineCount(latest.lines) > 0) return [];
    const status = normalizeWorkOrderStatus(row.status);
    return [{
      id: row.id,
      title: row.title,
      status,
      statusLabel: WORK_ORDER_STATUS_LABELS[status],
      propertyName: row.property.name,
      approvedTime: row.time_entries.length,
      approvedMaterial: row.material_entries.length,
      draftStatus: latest ? "empty" : "missing",
      draftStatusLabel: latest ? "Tomt utkast" : "Saknas",
      updatedAt: row.updated_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null,
      href: `/dashboard/arbetsorder/${row.id}#ekonomi`,
    }];
  }).slice(0, 50);

  const summary = {
    workOrders: workOrders.length,
    approvedTime: workOrders.reduce((sum, row) => sum + row.approvedTime, 0),
    approvedMaterial: workOrders.reduce((sum, row) => sum + row.approvedMaterial, 0),
  };

  return NextResponse.json(
    { summary, workOrders },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
