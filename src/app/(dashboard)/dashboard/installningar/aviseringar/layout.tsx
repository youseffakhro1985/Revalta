import type { ReactNode } from "react";
import { ServiceNotificationHealthCard } from "@/components/dashboard/service-notification-health-card";

type ServiceNotificationLayoutProps = {
  children: ReactNode;
};

export default function ServiceNotificationLayout({ children }: ServiceNotificationLayoutProps) {
  return (
    <div className="space-y-6">
      <ServiceNotificationHealthCard />
      {children}
    </div>
  );
}
