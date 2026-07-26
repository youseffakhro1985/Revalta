import db from "@/lib/db";
import type { LeaseInspectionRecord } from "@/lib/lease-inspection-items";
import {
  inspectionRecordEventType,
  inspectionWorkOrderLinkEventType,
  inspectionWorkOrderRecipient,
  type InspectionWorkOrderLink,
} from "@/lib/inspection-work-order-links";
import {
  addWorkOrderStatusEvent,
  allocateWorkOrderNumber,
  calculateWorkOrderSla,
  setWorkOrderEnterpriseFields,
} from "@/lib/work-order-enterprise-core";
import { setWorkOrderAssetLinks } from "@/lib/work-order-asset-links";
import { normalizeWorkOrderPriority } from "@/lib/work-order-workflow";

export async function createInspectionWorkOrders(args: {
  companyId: string;
  userId: string;
  leaseId: string;
  version: number;
  itemIds: string[];
}) {
  const lease = await db.lease.findFirst({
    where: { id: args.leaseId, company_id: args.companyId },
    select: {
      lease_number: true,
      property_id: true,
      unit_id: true,
      property: { select: { name: true } },
      lease_holder: { select: { name: true } },
    },
  });
  if (!lease) throw new InspectionWorkOrderError("Avtalet hittades inte", 404);

  const modernRecord = await db.leaseInspectionRecord.findUnique({
    where: { company_id_lease_id: { company_id: args.companyId, lease_id: args.leaseId } },
    select: { payload: true, version: true },
  });
  const event = modernRecord
    ? null
    : await db.integrationEvent.findFirst({
      where: { company_id: args.companyId, type: inspectionRecordEventType, recipient: args.leaseId },
      orderBy: { created_at: "desc" },
    });

  const record = modernRecord?.payload && typeof modernRecord.payload === "object"
    ? modernRecord.payload as unknown as LeaseInspectionRecord
    : event?.payload && typeof event.payload === "object"
      ? event.payload as unknown as LeaseInspectionRecord
      : null;
  if (!record) throw new InspectionWorkOrderError("Spara besiktningspunkterna först", 409);
  if (record.version !== args.version) {
    throw new InspectionWorkOrderError("Besiktningen har ändrats. Ladda om och försök igen.", 409);
  }

  const uniqueIds = [...new Set(args.itemIds)];
  if (!uniqueIds.length) throw new InspectionWorkOrderError("Välj minst en besiktningspunkt", 400);
  if (uniqueIds.length > 50) throw new InspectionWorkOrderError("Högst 50 arbetsorder kan skapas åt gången", 400);

  const items = record.items.filter((item) => uniqueIds.includes(item.id));
  if (items.length !== uniqueIds.length) {
    throw new InspectionWorkOrderError("En eller flera besiktningspunkter hittades inte", 404);
  }
  if (items.some((item) => item.condition !== "action_required" || item.resolved || !item.selectedForWorkOrder)) {
    throw new InspectionWorkOrderError("Alla valda punkter måste vara öppna och markerade för arbetsorder", 409);
  }

  const [modernLinks, legacyLinks] = await Promise.all([
    db.leaseInspectionWorkOrderLink.findMany({
      where: { company_id: args.companyId, lease_id: args.leaseId, item_id: { in: items.map((item) => item.id) } },
      select: { item_id: true },
    }),
    db.integrationEvent.findMany({
      where: {
        company_id: args.companyId,
        type: inspectionWorkOrderLinkEventType,
        recipient: { in: items.map((item) => inspectionWorkOrderRecipient(args.leaseId, item.id)) },
      },
    }),
  ]);
  const linkedIds = new Set<string>([
    ...modernLinks.map((link) => link.item_id),
    ...legacyLinks
      .map((link) => (link.payload as unknown as InspectionWorkOrderLink)?.itemId)
      .filter((value): value is string => Boolean(value)),
  ]);
  const pending = items.filter((item) => !linkedIds.has(item.id));
  if (!pending.length) throw new InspectionWorkOrderError("Alla valda punkter har redan arbetsorder", 409);

  const created = await db.$transaction(async (tx) => {
    const result: Array<{ itemId: string; workOrderId: string; workOrderNumber: string }> = [];
    for (const item of pending) {
      const createdAt = new Date();
      const priority = normalizeWorkOrderPriority(item.priority);
      const sla = calculateWorkOrderSla(createdAt, priority);
      const workOrderNumber = await allocateWorkOrderNumber(tx, args.companyId, createdAt);
      const workOrder = await tx.workOrder.create({
        data: {
          company_id: args.companyId,
          property_id: lease.property_id,
          unit_id: lease.unit_id,
          created_by_id: args.userId,
          title: `${item.area} · ${item.component} · ${lease.property.name}`,
          description: [
            `Besiktningsåtgärd för avtal ${lease.lease_number}.`,
            `Hyrespart: ${lease.lease_holder.name}`,
            `Anmärkning: ${item.description}`,
            item.recommendation ? `Rekommenderad åtgärd: ${item.recommendation}` : "",
          ].filter(Boolean).join("\n\n"),
          status: "planned",
          priority,
          created_at: createdAt,
        },
      });
      await setWorkOrderEnterpriseFields(tx, {
        workOrderId: workOrder.id,
        companyId: args.companyId,
        workOrderNumber,
        workType: "corrective",
        source: "inspection",
        responseDueAt: sla.responseDueAt,
        resolutionDueAt: sla.resolutionDueAt,
      });
      await setWorkOrderAssetLinks(tx, {
        workOrderId: workOrder.id,
        companyId: args.companyId,
        buildingId: null,
        technicalAssetId: null,
      });
      await addWorkOrderStatusEvent(tx, {
        companyId: args.companyId,
        workOrderId: workOrder.id,
        actorUserId: args.userId,
        fromStatus: null,
        toStatus: "planned",
        reason: "Skapad från besiktningspunkt",
        metadata: { leaseId: args.leaseId, itemId: item.id, recordVersion: record.version },
      });
      await tx.leaseInspectionWorkOrderLink.create({
        data: {
          company_id: args.companyId,
          lease_id: args.leaseId,
          item_id: item.id,
          record_version: record.version,
          work_order_id: workOrder.id,
          created_by_id: args.userId,
          created_at: createdAt,
        },
      });
      result.push({ itemId: item.id, workOrderId: workOrder.id, workOrderNumber });
    }
    await tx.auditLog.create({
      data: {
        company_id: args.companyId,
        actor_user_id: args.userId,
        entity_type: "lease_inspection",
        entity_id: args.leaseId,
        action: "lease_inspection.work_orders_created",
        metadata: {
          leaseNumber: lease.lease_number,
          recordVersion: record.version,
          count: result.length,
          itemIds: result.map((item) => item.itemId),
          workOrderIds: result.map((item) => item.workOrderId),
          storage: "LeaseInspectionWorkOrderLink",
        },
      },
    });
    return result;
  });
  return { created, skipped: items.length - pending.length };
}

export class InspectionWorkOrderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
