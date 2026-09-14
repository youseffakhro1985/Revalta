export const INVOICE_DRAFT_NOT_READY_FOR_INVOICING =
  "Markera fakturaunderlaget som klart innan arbetsordern kan faktureras.";

export function invoiceDraftAllowsWorkOrderInvoicing(
  draft: { status?: string | null } | null | undefined,
) {
  const status = String(draft?.status ?? "").trim();
  return status === "ready" || status === "exported";
}
