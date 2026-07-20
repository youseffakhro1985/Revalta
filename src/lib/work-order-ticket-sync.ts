import type { Prisma } from "@prisma/client";
import type { WorkOrderStatus } from "@/lib/work-order-workflow";

export type TicketStatus = "new" | "received" | "in_progress" | "waiting" | "completed" | "closed";

export function ticketStatusForWorkOrder(status: WorkOrderStatus): TicketStatus {
  switch (status) {
    case "new":
    case "planned":
      return "received";
    case "in_progress":
      return "in_progress";
    case "waiting_material":
    case "blocked":
      return "waiting";
    case "completed":
      return "completed";
    case "invoiced":
    case "cancelled":
      return "closed";
  }
}

export async function syncWorkOrderToTicket(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    ticketId: string | null;
    workOrderId: string;
    status: WorkOrderStatus;
    assignedToId: string | null;
    actorUserId: string;
    statusReason: string | null;
  },
) {
  if (!input.ticketId) return null;

  const ticket = await tx.ticket.findFirst({
    where: { id: input.ticketId, company_id: input.companyId },
    select: { id: true, status: true, assigned_to_id: true },
  });
  if (!ticket) return null;

  const nextStatus = ticketStatusForWorkOrder(input.status);
  const statusChanged = ticket.status !== nextStatus;
  const assigneeChanged = ticket.assigned_to_id !== input.assignedToId;
  if (!statusChanged && !assigneeChanged) {
    return { ticketId: ticket.id, changed: false, status: ticket.status };
  }

  await tx.ticket.update({
    where: { id: ticket.id },
    data: {
      status: nextStatus,
      assigned_to_id: input.assignedToId,
    },
  });

  await tx.auditLog.create({
    data: {
      company_id: input.companyId,
      actor_user_id: input.actorUserId,
      entity_type: "ticket",
      entity_id: ticket.id,
      action: "ticket.synced_from_work_order",
      metadata: {
        workOrderId: input.workOrderId,
        previousStatus: ticket.status,
        status: nextStatus,
        previousAssignedToId: ticket.assigned_to_id,
        assignedToId: input.assignedToId,
        statusReason: input.statusReason,
      },
    },
  });

  return { ticketId: ticket.id, changed: true, status: nextStatus };
}
