import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import db from "@/lib/db";
import { DashboardBreadcrumbs } from "@/components/dashboard/dashboard-breadcrumbs";
import { WorkOrderSlaDetailPanel } from "@/components/dashboard/work-order-sla-detail-panel";
import { getCurrentUser, shouldScopeToAssignedWork } from "@/lib/current-user";
import { getWorkOrderEnterpriseState } from "@/lib/work-order-enterprise-core";

export default async function WorkOrderDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.company_id) notFound();

  const { id } = await params;
  const [workOrder, enterprise] = await Promise.all([
    db.workOrder.findFirst({
      where: {
        id,
        company_id: user.company_id,
        deleted_at: null,
        property: { deleted_at: null },
      },
      select: { id: true, title: true, assigned_to_id: true },
    }),
    getWorkOrderEnterpriseState(db, user.company_id, id),
  ]);

  if (!workOrder) notFound();
  if (shouldScopeToAssignedWork(user.role) && workOrder.assigned_to_id !== user.id) notFound();

  return <div className="space-y-8">
    <DashboardBreadcrumbs
      items={[
        { label: "Drift" },
        { label: "Arbetsordrar", href: "/dashboard/arbetsorder" },
        { label: enterprise?.work_order_number || workOrder.title },
      ]}
    />
    {children}
    <WorkOrderSlaDetailPanel workOrderId={id} />
  </div>;
}
