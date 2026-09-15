export const legacyDashboardRedirects = {
  workOrders: "/dashboard/arbetsorder",
  workOrderOperations: "/dashboard/arbetsorder/operationsoversikt",
} as const;

export function legacyWorkOrderDetailRedirect(id: string) {
  return `/dashboard/arbetsorder/${encodeURIComponent(id)}`;
}

export function legacyWorkOrderEconomyRedirect(id: string) {
  return `${legacyWorkOrderDetailRedirect(id)}#ekonomi`;
}
