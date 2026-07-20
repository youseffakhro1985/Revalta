import db from "@/lib/db";
import { inspectionWorkOrderLinkEventType, type InspectionWorkOrderLink } from "@/lib/inspection-work-order-links";

export async function readInspectionWorkOrders(companyId: string, leaseId: string) {
  const events = await db.integrationEvent.findMany({
    where: { company_id: companyId, type: inspectionWorkOrderLinkEventType },
    orderBy: { created_at: "desc" },
    take: 500,
  });
  const links = events
    .map((event) => event.payload as unknown as InspectionWorkOrderLink)
    .filter((link) => link?.leaseId === leaseId && Boolean(link.workOrderId));
  const ids = links.map((link) => link.workOrderId);
  const orders = ids.length ? await db.workOrder.findMany({
    where: { company_id: companyId, id: { in: ids } },
    select: { id: true, status: true, priority: true, title: true, created_at: true, completed_at: true },
  }) : [];
  const byId = new Map(orders.map((order) => [order.id, order]));
  return links.map((link) => ({ ...link, workOrder: byId.get(link.workOrderId) ?? null }));
}
