import type { ReactNode } from "react";
import { ServiceNotificationAlertCenter } from "@/components/dashboard/service-notification-alert-center";
import { ServiceNotificationDeadLetter } from "@/components/dashboard/service-notification-dead-letter";
import { ServiceNotificationEscalationCenter } from "@/components/dashboard/service-notification-escalation-center";
import { ServiceNotificationHealthCard } from "@/components/dashboard/service-notification-health-card";
import { ServiceNotificationIncidentMetrics } from "@/components/dashboard/service-notification-incident-metrics";
import { ServiceNotificationIncidentSlaEscalations } from "@/components/dashboard/service-notification-incident-sla-escalations";
import { ServiceNotificationMetricsCard } from "@/components/dashboard/service-notification-metrics-card";
import { ServiceNotificationProviderStatus } from "@/components/dashboard/service-notification-provider-status";

type ServiceNotificationLayoutProps = {
  children: ReactNode;
};

export default function ServiceNotificationLayout({ children }: ServiceNotificationLayoutProps) {
  return (
    <div className="space-y-6">
      <ServiceNotificationHealthCard />
      <ServiceNotificationProviderStatus />
      <ServiceNotificationMetricsCard />
      <ServiceNotificationIncidentMetrics />
      <ServiceNotificationIncidentSlaEscalations />
      <ServiceNotificationAlertCenter />
      <ServiceNotificationEscalationCenter />
      <ServiceNotificationDeadLetter />
      {children}
    </div>
  );
}
