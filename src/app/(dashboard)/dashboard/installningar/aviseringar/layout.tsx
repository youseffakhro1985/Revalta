import type { ReactNode } from "react";
import { ServiceNotificationAlertCenter } from "@/components/dashboard/service-notification-alert-center";
import { ServiceNotificationDeadLetter } from "@/components/dashboard/service-notification-dead-letter";
import { ServiceNotificationHealthCard } from "@/components/dashboard/service-notification-health-card";
import { ServiceNotificationMetricsCard } from "@/components/dashboard/service-notification-metrics-card";

type ServiceNotificationLayoutProps = {
  children: ReactNode;
};

export default function ServiceNotificationLayout({ children }: ServiceNotificationLayoutProps) {
  return (
    <div className="space-y-6">
      <ServiceNotificationHealthCard />
      <ServiceNotificationMetricsCard />
      <ServiceNotificationAlertCenter />
      <ServiceNotificationDeadLetter />
      {children}
    </div>
  );
}
