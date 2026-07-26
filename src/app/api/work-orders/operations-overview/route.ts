import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { normalizeWorkOrderPriority, normalizeWorkOrderStatus, workOrderRisk, workOrderSlaDeadline, WORK_ORDER_PRIORITY_LABELS, WORK_ORDER_STATUS_LABELS } from "@/lib/work-order-workflow";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

  const rows = await db.workOrder.findMany({
    where: { deleted_at: null, company_id: user.company_id },
    orderBy: [{ scheduled_start: "asc" }, { created_at: "desc" }],
    take: 1000,
    include: {
      property: { select: { id: true, name: true, address: true, city: true } },
      unit: { select: { id: true, designation: true } },
      assigned_to: { select: { id: true, name: true, email: true } },
    },
  });

  const now = new Date();
  const workOrders = rows.map((row) => {
    const status = normalizeWorkOrderStatus(row.status);
    const priority = normalizeWorkOrderPriority(row.priority);
    const slaDeadline = row.scheduled_end ?? workOrderSlaDeadline(row.created_at, priority);
    return {
      id: row.id,
      title: row.title,
      status,
      statusLabel: WORK_ORDER_STATUS_LABELS[status],
      priority,
      priorityLabel: WORK_ORDER_PRIORITY_LABELS[priority],
      risk: workOrderRisk({ status, priority, createdAt: row.created_at, scheduledEnd: row.scheduled_end, now }),
      slaDeadline: slaDeadline.toISOString(),
      scheduledStart: row.scheduled_start?.toISOString() ?? null,
      scheduledEnd: row.scheduled_end?.toISOString() ?? null,
      property: row.property,
      unit: row.unit,
      assignee: row.assigned_to,
      estimatedCost: row.estimated_cost?.toString() ?? null,
      actualCost: row.actual_cost?.toString() ?? null,
      href: `/dashboard/arbetsorder/${row.id}`,
    };
  });

  const open = workOrders.filter((item) => !["completed", "invoiced", "cancelled"].includes(item.status));
  const summary = {
    total: workOrders.length,
    open: open.length,
    overdue: open.filter((item) => item.risk === "overdue").length,
    critical: open.filter((item) => item.risk === "critical").length,
    dueSoon: open.filter((item) => item.risk === "high" || item.risk === "medium").length,
    unassigned: open.filter((item) => !item.assignee).length,
  };

  return NextResponse.json({ summary, workOrders }, { headers: { "Cache-Control": "private, no-store" } });
}
