import type { LeaseInspectionRecord } from "@/lib/lease-inspection-items";

export const resolvedInspectionWorkOrderStatuses = new Set(["completed", "invoiced"]);

export function applyResolvedInspectionItems(
  record: LeaseInspectionRecord,
  resolvedItemIds: ReadonlySet<string>,
  actor: LeaseInspectionRecord["updatedBy"],
) {
  const changedIds: string[] = [];
  const items = record.items.map((item) => {
    if (!resolvedItemIds.has(item.id) || item.resolved) return item;
    changedIds.push(item.id);
    return { ...item, resolved: true, selectedForWorkOrder: false };
  });
  if (!changedIds.length) return { record, changedIds };
  return {
    changedIds,
    record: {
      ...record,
      version: record.version + 1,
      items,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    } satisfies LeaseInspectionRecord,
  };
}
