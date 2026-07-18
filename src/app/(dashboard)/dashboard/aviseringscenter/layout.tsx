import { WorkOrderLockSecurityAlerts } from "@/components/dashboard/work-order-lock-security-alerts";

export default function NotificationCenterLayout({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6"><WorkOrderLockSecurityAlerts />{children}</div>;
}
