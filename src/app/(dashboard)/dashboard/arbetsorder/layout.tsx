import type { ReactNode } from "react";
import { WorkOrderSlaPriorityQueue } from "@/components/dashboard/work-order-sla-priority-queue";

export default function WorkOrdersLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-8">
    <WorkOrderSlaPriorityQueue />
    {children}
  </div>;
}
