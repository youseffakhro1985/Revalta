import db from "@/lib/db";
import type { LeaseHandoverPayload } from "@/lib/lease-handover";
import type { LeaseInspectionRecord } from "@/lib/lease-inspection-items";
import { inspectionRecordEventType } from "@/lib/inspection-work-order-links";
import { readInspectionWorkOrders } from "@/lib/read-inspection-work-orders";

const HANDOVER_EVENT_TYPE = "lease_handover_record";

export async function getLeaseHandoverReport(companyId: string, leaseId: string) {
  const lease = await db.lease.findFirst({
    where: { id: leaseId, company_id: companyId },
    select: {
      id: true,
      lease_number: true,
      status: true,
      start_date: true,
      end_date: true,
      property: { select: { name: true, address: true, postal_code: true, city: true } },
      unit: { select: { designation: true, unit_type: true, area: true } },
      lease_holder: { select: { name: true, email: true, phone: true } },
    },
  });
  if (!lease) return null;

  const [modernHandover, modernInspection, handoverEvent, inspectionEvent, workOrders, audit] = await Promise.all([
    db.leaseHandoverRecord.findUnique({
      where: { company_id_lease_id: { company_id: companyId, lease_id: leaseId } },
      select: { payload: true },
    }),
    db.leaseInspectionRecord.findUnique({
      where: { company_id_lease_id: { company_id: companyId, lease_id: leaseId } },
      select: { payload: true },
    }),
    db.integrationEvent.findFirst({
      where: { company_id: companyId, type: HANDOVER_EVENT_TYPE, recipient: leaseId },
      orderBy: { created_at: "desc" },
    }),
    db.integrationEvent.findFirst({
      where: { company_id: companyId, type: inspectionRecordEventType, recipient: leaseId },
      orderBy: { created_at: "desc" },
    }),
    readInspectionWorkOrders(companyId, leaseId),
    db.auditLog.findMany({
      where: { company_id: companyId, entity_id: leaseId, entity_type: { in: ["lease_handover", "lease_inspection"] } },
      orderBy: { created_at: "desc" },
      take: 100,
      select: { id: true, action: true, created_at: true, metadata: true },
    }),
  ]);

  const handover = modernHandover?.payload && typeof modernHandover.payload === "object"
    ? modernHandover.payload as unknown as LeaseHandoverPayload
    : handoverEvent?.payload && typeof handoverEvent.payload === "object"
      ? handoverEvent.payload as unknown as LeaseHandoverPayload
      : null;
  const inspection = modernInspection?.payload && typeof modernInspection.payload === "object"
    ? modernInspection.payload as unknown as LeaseInspectionRecord
    : inspectionEvent?.payload && typeof inspectionEvent.payload === "object"
      ? inspectionEvent.payload as unknown as LeaseInspectionRecord
      : null;

  return { generatedAt: new Date().toISOString(), lease, handover, inspection, workOrders, audit };
}

export type LeaseHandoverReport = NonNullable<Awaited<ReturnType<typeof getLeaseHandoverReport>>>;
