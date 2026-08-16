import type { ReactNode } from "react";
import { ModuleNavigation, type ModuleNavigationSection } from "@/components/dashboard/module-navigation";
import { WorkOrderSlaPriorityQueue } from "@/components/dashboard/work-order-sla-priority-queue";

const sections: ModuleNavigationSection[] = [
  {
    items: [
      { href: "/dashboard/arbetsorder", label: "Arbetsordrar", icon: "wrench", exact: true },
      { href: "/dashboard/arbetsorder/planering", label: "Planering", icon: "users" },
      { href: "/dashboard/arbetsorder/operationsoversikt", label: "Arbetsorderöversikt", icon: "layout" },
      { href: "/dashboard/arbetsorder/aterkommande", label: "Återkommande", icon: "repeat" },
    ],
  },
];

export default function WorkOrdersLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-8">
    <ModuleNavigation ariaLabel="Arbetsorderområden" sections={sections} />
    <WorkOrderSlaPriorityQueue />
    {children}
  </div>;
}
