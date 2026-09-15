import {
  getAllowedWorkOrderTransitions,
  type WorkOrderStatus,
} from "@/lib/work-order-workflow";

export const INVOICE_DRAFT_NOT_READY_FOR_INVOICING =
  "Markera fakturaunderlaget som klart innan arbetsordern kan faktureras.";

export function invoiceDraftAllowsWorkOrderInvoicing(
  draft: { status?: string | null } | null | undefined,
) {
  const status = String(draft?.status ?? "").trim();
  return status === "ready" || status === "exported";
}

/** Planning quick-actions must match PATCH: Fakturerad only when the latest draft is ready/exported. */
export function allowedStatusesForWorkOrderQuickActions(
  current: WorkOrderStatus,
  canMarkInvoiced: boolean,
) {
  return getAllowedWorkOrderTransitions(current).filter((status) => {
    if (status === "invoiced" && current === "completed" && !canMarkInvoiced) return false;
    return true;
  });
}
