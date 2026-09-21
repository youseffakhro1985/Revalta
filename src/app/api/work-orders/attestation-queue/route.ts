import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canManageWorkOrderFinance, getCurrentUser, requireCompanyUser } from "@/lib/current-user";
import { normalizeWorkOrderStatus, WORK_ORDER_STATUS_LABELS } from "@/lib/work-order-workflow";

export const dynamic = "force-dynamic";

export async function GET() {
  const rawUser = await getCurrentUser();
  if (!rawUser) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  const user = requireCompanyUser(rawUser);
  if (!user) return NextResponse.json({ error: "En aktiv organisation och personalbehörighet krävs" }, { status: 403 });
  if (!canManageWorkOrderFinance(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att attestera tid och material" }, { status: 403 });
  }

  const rows = await db.workOrder.findMany({
    where: {
      company_id: user.company_id,
      deleted_at: null,
      property: { deleted_at: null },
      OR: [
        { time_entries: { some: { status: "submitted" } } },
        { material_entries: { some: { status: "submitted" } } },
      ],
    },
    orderBy: { updated_at: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      status: true,
      updated_at: true,
      completed_at: true,
      property: { select: { id: true, name: true } },
      time_entries: { where: { status: "submitted" }, select: { id: true } },
      material_entries: { where: { status: "submitted" }, select: { id: true } },
    },
  });

  const workOrders = rows.map((row) => {
    const status = normalizeWorkOrderStatus(row.status);
    return {
      id: row.id,
      title: row.title,
      status,
      statusLabel: WORK_ORDER_STATUS_LABELS[status],
      propertyName: row.property.name,
      pendingTime: row.time_entries.length,
      pendingMaterial: row.material_entries.length,
      updatedAt: row.updated_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null,
      href: `/dashboard/arbetsorder/${row.id}#ekonomi`,
    };
  });

  const summary = {
    workOrders: workOrders.length,
    pendingTime: workOrders.reduce((sum, row) => sum + row.pendingTime, 0),
    pendingMaterial: workOrders.reduce((sum, row) => sum + row.pendingMaterial, 0),
  };

  return NextResponse.json(
    { summary, workOrders },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
