import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canAssignWorkOrders, getCurrentUser } from "@/lib/current-user";
import {
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_STATUS_LABELS,
  normalizeWorkOrderPriority,
  normalizeWorkOrderStatus,
} from "@/lib/work-order-workflow";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });
  if (!canAssignWorkOrders(user.role)) {
    return NextResponse.json({ error: "Du saknar behörighet att tilldela arbetsordrar" }, { status: 403 });
  }

  const [rows, assignees] = await Promise.all([
    db.workOrder.findMany({
      where: {
        company_id: user.company_id,
        deleted_at: null,
        assigned_to_id: null,
        status: { notIn: ["completed", "invoiced", "cancelled"] },
        property: { deleted_at: null },
      },
      orderBy: [{ priority: "desc" }, { created_at: "asc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        work_order_number: true,
        created_at: true,
        property: { select: { id: true, name: true } },
      },
    }),
    db.user.findMany({
      where: {
        company_id: user.company_id,
        status: "active",
        role: { in: ["owner", "admin", "manager", "technician"] },
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);

  const workOrders = rows.map((row) => {
    const status = normalizeWorkOrderStatus(row.status);
    const priority = normalizeWorkOrderPriority(row.priority);
    return {
      id: row.id,
      title: row.title,
      status,
      statusLabel: WORK_ORDER_STATUS_LABELS[status],
      priority,
      priorityLabel: WORK_ORDER_PRIORITY_LABELS[priority],
      workOrderNumber: row.work_order_number,
      propertyName: row.property.name,
      createdAt: row.created_at.toISOString(),
      href: `/dashboard/arbetsorder/${row.id}`,
    };
  });

  return NextResponse.json(
    {
      summary: { workOrders: workOrders.length },
      selfId: user.id,
      assignees: assignees.map((member) => ({
        id: member.id,
        name: member.name || member.email,
        role: member.role,
      })),
      workOrders,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
