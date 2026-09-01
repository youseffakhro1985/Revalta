import { Prisma } from "@prisma/client";
import { syncCompletedWorkOrderToComponent } from "@/lib/component-work-order-sync";
import { addWorkOrderStatusEvent } from "@/lib/work-order-enterprise-core";
import { syncWorkOrderToTicket } from "@/lib/work-order-ticket-sync";

export class WorkOrderCompletionConflict extends Error {
  constructor() {
    super("Arbetsordern kan bara slutföras när den är påbörjad");
    this.name = "WorkOrderCompletionConflict";
  }
}

export async function completeWorkOrderLifecycle(
  tx: Prisma.TransactionClient,
  args: {
    companyId: string;
    workOrderId: string;
    actorUserId: string;
    completedAt: Date;
    actualCost?: number | null;
    legacySlaStatus?: string;
    statusReason?: string | null;
    statusEventMetadata?: Prisma.InputJsonValue;
  },
) {
  const current = await tx.workOrder.findFirst({
    where: {
      id: args.workOrderId,
      company_id: args.companyId,
      deleted_at: null,
      status: "in_progress",
    },
    select: { responded_at: true },
  });
  if (!current) throw new WorkOrderCompletionConflict();

  const updateResult = await tx.workOrder.updateMany({
    where: {
      id: args.workOrderId,
      company_id: args.companyId,
      deleted_at: null,
      status: "in_progress",
    },
    data: {
      status: "completed",
      completed_at: args.completedAt,
      responded_at: current.responded_at ?? args.completedAt,
      paused_at: null,
      pause_reason: null,
      closed_at: null,
      ...(args.actualCost !== undefined ? { actual_cost: args.actualCost } : {}),
      ...(args.legacySlaStatus ? { sla_status: args.legacySlaStatus } : {}),
    },
  });
  if (updateResult.count !== 1) throw new WorkOrderCompletionConflict();

  const updated = await tx.workOrder.findFirst({
    where: { id: args.workOrderId, company_id: args.companyId, deleted_at: null },
    select: {
      id: true,
      ticket_id: true,
      property_id: true,
      technical_asset_id: true,
      assigned_to_id: true,
      work_order_number: true,
      work_type: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      completed_at: true,
      actual_cost: true,
    },
  });
  if (!updated) throw new WorkOrderCompletionConflict();

  await addWorkOrderStatusEvent(tx, {
    companyId: args.companyId,
    workOrderId: args.workOrderId,
    actorUserId: args.actorUserId,
    fromStatus: "in_progress",
    toStatus: "completed",
    reason: args.statusReason ?? null,
    metadata: args.statusEventMetadata,
  });

  const ticketSync = await syncWorkOrderToTicket(tx, {
    companyId: args.companyId,
    ticketId: updated.ticket_id,
    workOrderId: updated.id,
    status: "completed",
    assignedToId: updated.assigned_to_id,
    actorUserId: args.actorUserId,
    statusReason: args.statusReason ?? null,
  });

  const componentSync = await syncCompletedWorkOrderToComponent(tx, {
    companyId: args.companyId,
    propertyId: updated.property_id,
    technicalAssetId: updated.technical_asset_id,
    workOrderId: updated.id,
    workOrderNumber: updated.work_order_number,
    workType: updated.work_type || "corrective",
    title: updated.title,
    description: updated.description,
    actorUserId: args.actorUserId,
    completedAt: updated.completed_at ?? args.completedAt,
    actualCost: updated.actual_cost === null ? null : Number(updated.actual_cost),
  });

  return { workOrder: updated, ticketSync, componentSync };
}
