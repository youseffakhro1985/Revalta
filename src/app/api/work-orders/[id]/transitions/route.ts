import { NextResponse } from "next/server";
import db from "@/lib/db";
import { canAssignWorkOrders, canManageTickets, getCurrentUser, type CompanyUser } from "@/lib/current-user";
import { getAllowedWorkOrderTransitions } from "@/lib/work-order-enterprise-core";
import { normalizeWorkOrderStatus } from "@/lib/work-order-workflow";
import { isAssignedWorkAccessible, notFoundWorkOrder } from "@/lib/assigned-work-access";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/work-orders/[id]/transitions" });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!user.company_id) return NextResponse.json({ error: "Användaren saknar organisation" }, { status: 400 });

    const { id } = await params;
    const [workOrder, users] = await Promise.all([
      db.workOrder.findFirst({
        where: { deleted_at: null, id, company_id: user.company_id, property: { deleted_at: null } },
        select: { id: true, status: true, assigned_to_id: true },
      }),
      db.user.findMany({
        where: { company_id: user.company_id, status: "active" },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: { id: true, name: true, email: true, role: true },
      }),
    ]);

    if (!workOrder) return notFoundWorkOrder();
    if (!isAssignedWorkAccessible(user as CompanyUser, workOrder.assigned_to_id)) return notFoundWorkOrder();

    const currentStatus = normalizeWorkOrderStatus(workOrder.status);
    return NextResponse.json(
      {
        currentStatus,
        allowedStatuses: getAllowedWorkOrderTransitions(currentStatus),
        assignedToId: workOrder.assigned_to_id,
        users: canAssignWorkOrders(user.role)
          ? users.filter((member) => ["owner", "admin", "manager", "technician"].includes(member.role))
          : [],
        canManage: canManageTickets(user.role),
        canAssign: canAssignWorkOrders(user.role),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    logger.error("Get work order transitions error", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
