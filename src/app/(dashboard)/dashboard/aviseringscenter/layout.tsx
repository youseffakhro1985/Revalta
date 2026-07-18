import type { ReactNode } from "react";
import { WorkOrderLockSecurityAlerts } from "@/components/dashboard/work-order-lock-security-alerts";

type NotificationCenterLayoutProps = {
  children: ReactNode;
};

export default function NotificationCenterLayout({ children }: NotificationCenterLayoutProps) {
  return (
    <div className="space-y-6">
      <WorkOrderLockSecurityAlerts />
      {children}
    </div>
  );
}
