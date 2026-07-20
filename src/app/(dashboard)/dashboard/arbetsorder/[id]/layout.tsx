import type { ReactNode } from "react";
import { WorkOrderSlaDetailPanel } from "@/components/dashboard/work-order-sla-detail-panel";

export default async function WorkOrderDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <div className="space-y-8">
    {children}
    <WorkOrderSlaDetailPanel workOrderId={id} />
  </div>;
}
