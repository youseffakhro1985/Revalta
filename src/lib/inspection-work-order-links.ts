export const inspectionRecordEventType = "lease_inspection_items";
export const inspectionWorkOrderLinkEventType = "lease_inspection_item_work_order";

export type InspectionWorkOrderLink = {
  leaseId: string;
  itemId: string;
  recordVersion: number;
  workOrderId: string;
  createdAt: string;
};

export function inspectionWorkOrderRecipient(leaseId: string, itemId: string) {
  return `${leaseId}:${itemId}`;
}
