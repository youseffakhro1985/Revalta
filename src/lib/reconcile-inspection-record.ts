import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import type { LeaseInspectionRecord } from "@/lib/lease-inspection-items";
import { inspectionRecordEventType } from "@/lib/inspection-work-order-links";
import { readInspectionWorkOrders } from "@/lib/read-inspection-work-orders";
import { applyResolvedInspectionItems, resolvedInspectionWorkOrderStatuses } from "@/lib/inspection-resolution-sync";

export async function reconcileInspectionRecord(args: {
  companyId: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  leaseId: string;
  version: number;
}) {
  const lease = await db.lease.findFirst({
    where: { id: args.leaseId, company_id: args.companyId },
    select: { lease_number: true },
  });
  if (!lease) throw new InspectionRecordSyncError("Avtalet hittades inte", 404);

  const modern = await db.leaseInspectionRecord.findUnique({
    where: { company_id_lease_id: { company_id: args.companyId, lease_id: args.leaseId } },
    select: { id: true, payload: true, version: true },
  });
  const event = modern
    ? null
    : await db.integrationEvent.findFirst({
      where: { company_id: args.companyId, type: inspectionRecordEventType, recipient: args.leaseId },
      orderBy: { created_at: "desc" },
    });

  const current = modern?.payload && typeof modern.payload === "object"
    ? modern.payload as unknown as LeaseInspectionRecord
    : event?.payload && typeof event.payload === "object"
      ? event.payload as unknown as LeaseInspectionRecord
      : null;
  if (!current) throw new InspectionRecordSyncError("Ingen sparad besiktning hittades", 404);
  if (current.version !== args.version) throw new InspectionRecordSyncError("Besiktningen har ändrats. Ladda om och försök igen.", 409);

  const links = await readInspectionWorkOrders(args.companyId, args.leaseId);
  const resolvedIds = new Set(
    links
      .filter((link) => link.workOrder && resolvedInspectionWorkOrderStatuses.has(link.workOrder.status))
      .map((link) => link.itemId),
  );
  const result = applyResolvedInspectionItems(current, resolvedIds, {
    id: args.userId,
    name: args.userName,
    email: args.userEmail,
  });
  if (!result.changedIds.length) return { record: current, changed: 0, changedIds: [] as string[] };

  const actionRequired = result.record.items.filter((item) => item.condition === "action_required" && !item.resolved).length;
  await db.$transaction(async (tx) => {
    if (modern) {
      await tx.leaseInspectionRecord.update({
        where: { id: modern.id },
        data: {
          status: actionRequired > 0 ? "action_required" : "recorded",
          version: result.record.version,
          payload: result.record as unknown as Prisma.InputJsonValue,
          updated_by_id: args.userId,
        },
      });
    } else if (event) {
      await tx.integrationEvent.update({
        where: { id: event.id },
        data: { status: actionRequired > 0 ? "action_required" : "recorded", payload: result.record as unknown as Prisma.InputJsonValue },
      });
    }
    await tx.auditLog.create({
      data: {
        company_id: args.companyId,
        actor_user_id: args.userId,
        entity_type: "lease_inspection",
        entity_id: args.leaseId,
        action: "lease_inspection.work_orders_reconciled",
        metadata: {
          leaseNumber: lease.lease_number,
          previousVersion: current.version,
          version: result.record.version,
          changedIds: result.changedIds,
          remainingActionRequired: actionRequired,
          storage: modern ? "LeaseInspectionRecord" : "IntegrationEvent",
        },
      },
    });
  });
  return { record: result.record, changed: result.changedIds.length, changedIds: result.changedIds };
}

export class InspectionRecordSyncError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
