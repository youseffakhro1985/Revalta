import db from "@/lib/db";
import { inspectionWorkOrderLinkEventType, type InspectionWorkOrderLink } from "@/lib/inspection-work-order-links";

export async function readInspectionWorkOrders(companyId: string, leaseId: string) {
  const [modernLinks, events] = await Promise.all([
    db.leaseInspectionWorkOrderLink.findMany({
      where: { company_id: companyId, lease_id: leaseId },
      orderBy: { created_at: "desc" },
      take: 500,
    }),
    db.integrationEvent.findMany({
      where: { company_id: companyId, type: inspectionWorkOrderLinkEventType },
      orderBy: { created_at: "desc" },
      take: 500,
    }),
  ]);

  const links = new Map<string, InspectionWorkOrderLink>();
  for (const event of events) {
    const link = event.payload as unknown as InspectionWorkOrderLink;
    if (!link?.leaseId || link.leaseId !== leaseId || !link.workOrderId || !link.itemId) continue;
    if (!links.has(link.itemId)) links.set(link.itemId, link);
  }
  for (const row of modernLinks) {
    links.set(row.item_id, {
      leaseId: row.lease_id,
      itemId: row.item_id,
      recordVersion: row.record_version,
      workOrderId: row.work_order_id,
      createdAt: row.created_at.toISOString(),
    });
  }

  const rows = [...links.values()];
  const ids = rows.map((link) => link.workOrderId);
  const orders = ids.length
    ? await db.workOrder.findMany({
      where: { deleted_at: null, company_id: companyId, id: { in: ids } },
      select: { id: true, status: true, priority: true, title: true, created_at: true, completed_at: true },
    })
    : [];
  const byId = new Map(orders.map((order) => [order.id, order]));
  return rows.map((link) => ({ ...link, workOrder: byId.get(link.workOrderId) ?? null }));
}
